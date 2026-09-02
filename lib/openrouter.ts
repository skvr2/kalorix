const EXHAUST_MS = 45 * 60 * 1000;
const exhaustedUntil = new Map<string, number>();
let nextKeyIndex = 0;

const MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.0-flash-001",
  "openai/gpt-4o-mini",
];

export function getOpenRouterKeys(): string[] {
  const multi = process.env.OPENROUTER_API_KEYS ?? "";
  const single = process.env.OPENROUTER_API_KEY ?? "";
  const keys = multi
    .split(/[,;\n]+/)
    .map((k) => k.trim())
    .filter(Boolean);
  if (single.trim() && !keys.includes(single.trim())) {
    keys.unshift(single.trim());
  }
  return keys;
}

function isExhausted(key: string) {
  const until = exhaustedUntil.get(key);
  return Boolean(until && until > Date.now());
}

function markExhausted(key: string) {
  exhaustedUntil.set(key, Date.now() + EXHAUST_MS);
}

export function keysStatus() {
  const keys = getOpenRouterKeys();
  const now = Date.now();
  return {
    total: keys.length,
    available: keys.filter((k) => {
      const until = exhaustedUntil.get(k);
      return !until || until <= now;
    }).length,
  };
}

type ChatBody = {
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
};

export async function openRouterChat(body: ChatBody) {
  const keys = getOpenRouterKeys();
  if (!keys.length) {
    throw new Error("Brak kluczy OpenRouter w .env.local");
  }

  const ordered = [
    ...keys.slice(nextKeyIndex),
    ...keys.slice(0, nextKeyIndex),
  ];

  let lastError = "Nie udało się połączyć z OpenRouter.";

  for (let k = 0; k < ordered.length; k++) {
    const key = ordered[k];
    if (isExhausted(key)) continue;

    for (const model of MODELS) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
          "X-Title": "Kalorix",
        },
        body: JSON.stringify({
          model,
          temperature: body.temperature ?? 0.2,
          max_tokens: body.max_tokens ?? 1200,
          response_format: body.response_format,
          messages: body.messages,
        }),
      });

      if ([401, 402, 403, 408, 429, 502, 503].includes(res.status)) {
        markExhausted(key);
        lastError = `Klucz ${k + 1} padł (${res.status}). Próbuję kolejny.`;
        break;
      }

      if (!res.ok) {
        lastError = await res.text();
        continue;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const originalIndex = keys.indexOf(key);
      nextKeyIndex = (originalIndex + 1) % keys.length;
      return {
        content: data.choices?.[0]?.message?.content ?? "",
        model,
        keySlot: originalIndex + 1,
      };
    }
  }

  throw new Error(lastError);
}

export function parseJsonContent<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced?.[1]?.trim() ?? trimmed;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("AI nie zwróciło poprawnego JSON.");
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}
