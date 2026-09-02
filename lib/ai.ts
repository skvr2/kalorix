import { loadSettings, saveSettings } from "./storage";
import type { AnalyzeResult, DietPlan, MealType, Profile, Goals } from "./types";

const MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.0-flash-001",
  "openai/gpt-4o-mini",
];

const EXHAUST_MS = 45 * 60 * 1000;
const exhaustedUntil = new Map<string, number>();
let nextKeyIndex = 0;

function parseKeys(raw: string) {
  return raw
    .split(/[,;\n]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export function getKeys() {
  return loadSettings().keys.filter(Boolean);
}

export function maskKey(key: string) {
  if (key.length < 14) return "••••";
  return `${key.slice(0, 9)}…${key.slice(-4)}`;
}

export function addKeys(text: string) {
  const incoming = parseKeys(text);
  const settings = loadSettings();
  const seen = new Set(settings.keys);
  for (const key of incoming) seen.add(key);
  settings.keys = [...seen];
  saveSettings(settings);
  return settings.keys;
}

export function removeKey(key: string) {
  const settings = loadSettings();
  settings.keys = settings.keys.filter((item) => item !== key);
  exhaustedUntil.delete(key);
  saveSettings(settings);
  return settings.keys;
}

export function keyStates() {
  const now = Date.now();
  return getKeys().map((key, i) => ({
    key,
    slot: i + 1,
    label: maskKey(key),
    paused: Boolean(exhaustedUntil.get(key) && exhaustedUntil.get(key)! > now),
  }));
}

function markExhausted(key: string) {
  exhaustedUntil.set(key, Date.now() + EXHAUST_MS);
}

export async function openRouterChat(messages: unknown[], maxTokens = 1600) {
  const keys = getKeys();
  if (!keys.length) {
    throw new Error("Dodaj klucz w zakładce Klucze.");
  }
  const ordered = [...keys.slice(nextKeyIndex), ...keys.slice(0, nextKeyIndex)];
  let lastError = "OpenRouter nie odpowiedział.";

  for (const key of ordered) {
    const until = exhaustedUntil.get(key);
    if (until && until > Date.now()) continue;

    for (const model of MODELS) {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "Kalorix",
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages,
        }),
      });

      if ([401, 402, 403, 408, 429, 502, 503].includes(res.status)) {
        markExhausted(key);
        lastError = `Klucz padł (${res.status}). Próbuję kolejny.`;
        break;
      }
      if (!res.ok) {
        lastError = await res.text();
        continue;
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      nextKeyIndex = (keys.indexOf(key) + 1) % keys.length;
      return data.choices?.[0]?.message?.content ?? "";
    }
  }
  throw new Error(lastError);
}

function parseJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced?.[1]?.trim() ?? trimmed;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("AI nie zwróciło JSON.");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export async function analyzePhoto(image: string, hint: string): Promise<AnalyzeResult> {
  const raw = await openRouterChat([
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Jesteś dietetykiem. Oceń jedzenie ze zdjęcia. Zwróć JSON:
{"mealGuess":"breakfast|lunch|dinner|snack","confidence":0-1,"summary":"krótko po polsku","items":[{"name":"","grams":0,"kcal":0,"protein":0,"fat":0,"carbs":0,"note":""}]}
Rozbij na składniki. Realistyczne makro.
${hint ? `Wskazówka: ${hint}` : ""}`,
        },
        { type: "image_url", image_url: { url: image } },
      ],
    },
  ]);
  const parsed = parseJson<AnalyzeResult>(raw);
  parsed.mealGuess = MEALS.includes(parsed.mealGuess) ? parsed.mealGuess : "lunch";
  parsed.items = (parsed.items ?? []).map((item) => ({
    name: String(item.name || "Posiłek"),
    grams: Math.max(1, Math.round(Number(item.grams) || 100)),
    kcal: Math.max(0, Math.round(Number(item.kcal) || 0)),
    protein: Math.max(0, Number(item.protein) || 0),
    fat: Math.max(0, Number(item.fat) || 0),
    carbs: Math.max(0, Number(item.carbs) || 0),
    note: item.note ? String(item.note) : "",
  }));
  return parsed;
}

export async function searchFood(query: string) {
  const raw = await openRouterChat([
    {
      role: "user",
      content: `Wartości odżywcze jak w Fitatu dla: "${query}". JSON: {"items":[{"name":"","grams":100,"kcal":0,"protein":0,"fat":0,"carbs":0}]} 4–8 polskich produktów.`,
    },
  ]);
  return parseJson<{ items: AnalyzeResult["items"] }>(raw).items ?? [];
}

export async function generateDiet(profile: Profile, goals: Goals, extras: string) {
  const raw = await openRouterChat(
    [
      {
        role: "user",
        content: `Ułóż prostą, realną dietę na 7 dni (Polska, zwykłe produkty, bez lania wody).
Profil: ${profile.sex}, ${profile.age} lat, ${profile.heightCm} cm, ${profile.weightKg} kg, aktywność ${profile.activity}, cel ${profile.goal}.
Limity dnia: ${goals.kcal} kcal, białko ${goals.protein} g, tłuszcz ${goals.fat} g, węgle ${goals.carbs} g.
${extras ? `Dodatkowo: ${extras}` : ""}
JSON:
{"title":"","summary":"2–3 zdania","days":[{"label":"Poniedziałek","meals":{"breakfast":[{"name":"","grams":0,"kcal":0,"protein":0,"fat":0,"carbs":0}],"lunch":[],"dinner":[],"snack":[]}}]}
Suma dnia ma być blisko limitów.`,
      },
    ],
    4000,
  );
  return parseJson<DietPlan>(raw);
}
