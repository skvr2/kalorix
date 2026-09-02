"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVITY_LABELS,
  GOAL_LABELS,
  MEAL_LABELS,
  addItems,
  addWater,
  loadDay,
  loadDiet,
  loadGoals,
  loadProfile,
  loadSettings,
  removeItem,
  saveDiet,
  saveGoals,
  saveProfile,
  saveSettings,
  suggestedGoals,
  todayISO,
  totals,
} from "@/lib/storage";
import {
  addKeys,
  analyzePhoto,
  generateDiet,
  getKeys,
  keyStates,
  removeKey,
  searchFood,
} from "@/lib/ai";
import { compressImage, uid } from "@/lib/image";
import type {
  AnalyzeResult,
  DayLog,
  DietPlan,
  FoodItem,
  Goals,
  MealType,
  Profile,
  Settings,
} from "@/lib/types";

type Tab = "diary" | "diet" | "water" | "keys";
type Sheet = "closed" | "add" | "review" | "manual" | "search";
const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function Ring({ value, max }: { value: number; max: number }) {
  const pct = Math.min(1, max ? value / max : 0);
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[120px] w-[120px]">
      <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#ececec" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="#00a86b"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-[22px] font-semibold leading-none tracking-tight">{Math.round(value)}</div>
          <div className="mt-1 text-[11px] text-[#8e8e93]">/ {max}</div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-[#8e8e93]">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-[#eee] bg-white px-3 py-2.5 text-[15px] outline-none focus:border-[#00a86b]";

export default function AppShell() {
  const [tab, setTab] = useState<Tab>("diary");
  const [date, setDate] = useState(todayISO());
  const [day, setDay] = useState<DayLog>(() => loadDay(todayISO()));
  const [goals, setGoals] = useState<Goals>(loadGoals);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [diet, setDiet] = useState<DietPlan | null>(loadDiet);
  const [sheet, setSheet] = useState<Sheet>("closed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const [review, setReview] = useState<AnalyzeResult | null>(null);
  const [meal, setMeal] = useState<MealType>("lunch");
  const [hint, setHint] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AnalyzeResult["items"]>([]);
  const [newKey, setNewKey] = useState("");
  const [keyRows, setKeyRows] = useState(() => keyStates());
  const [dietNotes, setDietNotes] = useState("");
  const [customMl, setCustomMl] = useState("");
  const [manual, setManual] = useState({
    name: "",
    grams: "100",
    kcal: "",
    protein: "",
    fat: "",
    carbs: "",
  });
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDay(loadDay(date));
    document.documentElement.dataset.theme = settings.theme;
  }, [date, settings.theme]);

  const sum = useMemo(() => totals(day), [day]);
  const left = goals.kcal - sum.kcal;
  const dark = settings.theme === "dark";
  const page = dark ? "bg-[#111] text-white" : "bg-[#f4f5f7] text-[#1a1a1a]";
  const card = dark ? "bg-[#1c1c1e]" : "bg-white";
  const muted = dark ? "text-white/45" : "text-[#8e8e93]";
  const line = dark ? "border-white/10" : "border-[#eee]";

  async function onPhoto(file?: File) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const image = await compressImage(file);
      setPreview(image);
      const data = await analyzePhoto(image, hint);
      setReview(data);
      setMeal(data.mealGuess || "lunch");
      setSheet("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
      setSheet("add");
    } finally {
      setBusy(false);
    }
  }

  function commit(items: AnalyzeResult["items"], photo?: string) {
    const mapped: FoodItem[] = items.map((item) => ({ ...item, id: uid(), photo }));
    setDay(addItems(date, meal, mapped));
    setSheet("closed");
    setReview(null);
    setPreview("");
    setHint("");
  }

  function shiftDate(n: number) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + n);
    setDate(todayISO(d));
  }

  async function onSearch() {
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      setHits(await searchFood(query));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
    } finally {
      setBusy(false);
    }
  }

  async function onDiet() {
    setBusy(true);
    setError("");
    try {
      const plan = await generateDiet(profile, goals, dietNotes);
      saveDiet(plan);
      setDiet(plan);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd");
    } finally {
      setBusy(false);
    }
  }

  function applySuggested() {
    const next = suggestedGoals(profile);
    saveGoals(next);
    setGoals(next);
  }

  return (
    <div className={`mx-auto flex min-h-[100dvh] max-w-md flex-col ${page}`}>
      <header className="px-5 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <button type="button" className={`${muted} px-2 text-xl`} onClick={() => shiftDate(-1)}>
            ‹
          </button>
          <div className="text-center">
            <div className="text-[13px] font-medium tracking-wide">Kalorix</div>
            <div className={`text-[12px] ${muted}`}>{date === todayISO() ? "Dziś" : date}</div>
          </div>
          <button type="button" className={`${muted} px-2 text-xl`} onClick={() => shiftDate(1)}>
            ›
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-5 pb-28">
        {tab === "diary" && (
          <>
            {!getKeys().length && (
              <button
                type="button"
                onClick={() => setTab("keys")}
                className="mb-3 w-full rounded-2xl bg-[#00a86b] px-4 py-3 text-left text-[13px] text-white"
              >
                Dodaj klucz OpenRouter w zakładce Klucze.
              </button>
            )}
            <section className={`rounded-2xl ${card} p-4`}>
              <div className="flex items-center gap-4">
                <Ring value={sum.kcal} max={goals.kcal} />
                <div className="min-w-0 flex-1">
                  <div className={`text-[12px] ${muted}`}>Pozostało</div>
                  <div className="text-[28px] font-semibold leading-none tracking-tight">
                    {left}
                    <span className={`ml-1 text-[13px] font-normal ${muted}`}>kcal</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {[
                      ["B", sum.protein, goals.protein, "#3b82f6"],
                      ["T", sum.fat, goals.fat, "#f59e0b"],
                      ["W", sum.carbs, goals.carbs, "#ef4444"],
                    ].map(([label, v, m, color]) => (
                      <div key={String(label)} className="flex items-center gap-2">
                        <span className={`w-3 text-[11px] ${muted}`}>{label}</span>
                        <div className={`h-[3px] flex-1 overflow-hidden rounded-full ${dark ? "bg-white/10" : "bg-[#f0f0f0]"}`}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (Number(v) / Number(m)) * 100 || 0)}%`,
                              background: String(color),
                            }}
                          />
                        </div>
                        <span className={`w-16 text-right text-[11px] ${muted}`}>
                          {Math.round(Number(v))}/{m}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTab("water")}
                className={`mt-4 flex w-full items-center justify-between rounded-xl ${dark ? "bg-white/5" : "bg-[#f7f7f8]"} px-3 py-2.5`}
              >
                <span className="text-[13px]">Woda</span>
                <span className="text-[13px] font-medium">
                  {day.waterMl} / {profile.waterGoal} ml
                </span>
              </button>
            </section>

            {MEALS.map((type) => {
              const items = day.meals[type];
              const kcal = items.reduce((a, b) => a + b.kcal, 0);
              return (
                <section key={type} className="mt-5">
                  <div className="mb-2 flex items-baseline justify-between">
                    <h2 className="text-[16px] font-semibold">{MEAL_LABELS[type]}</h2>
                    <span className={`text-[12px] ${muted}`}>{kcal} kcal</span>
                  </div>
                  <div className={`overflow-hidden rounded-2xl ${card}`}>
                    {items.map((item, i) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 px-3 py-3 ${i ? `border-t ${line}` : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px]">{item.name}</div>
                          <div className={`text-[12px] ${muted}`}>
                            {item.grams} g · {Math.round(item.protein)} / {Math.round(item.fat)} / {Math.round(item.carbs)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[14px] font-medium">{item.kcal}</div>
                          <button
                            type="button"
                            className="text-[11px] text-[#c45c5c]"
                            onClick={() => setDay(removeItem(date, type, item.id))}
                          >
                            Usuń
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={`flex w-full items-center justify-center gap-1 py-3 text-[13px] text-[#00a86b] ${items.length ? `border-t ${line}` : ""}`}
                      onClick={() => {
                        setMeal(type);
                        setSheet("add");
                      }}
                    >
                      + Dodaj
                    </button>
                  </div>
                </section>
              );
            })}
          </>
        )}

        {tab === "diet" && (
          <div className="space-y-4">
            <section className={`rounded-2xl ${card} p-4 space-y-3`}>
              <h2 className="text-[16px] font-semibold">Twój profil</h2>
              <Field label="Imię">
                <input className={inputCls} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Płeć">
                  <select
                    className={inputCls}
                    value={profile.sex}
                    onChange={(e) => setProfile({ ...profile, sex: e.target.value as Profile["sex"] })}
                  >
                    <option value="female">Kobieta</option>
                    <option value="male">Mężczyzna</option>
                    <option value="other">Inna</option>
                  </select>
                </Field>
                <Field label="Wiek">
                  <input type="number" className={inputCls} value={profile.age} onChange={(e) => setProfile({ ...profile, age: Number(e.target.value) })} />
                </Field>
                <Field label="Wzrost (cm)">
                  <input type="number" className={inputCls} value={profile.heightCm} onChange={(e) => setProfile({ ...profile, heightCm: Number(e.target.value) })} />
                </Field>
                <Field label="Waga (kg)">
                  <input type="number" className={inputCls} value={profile.weightKg} onChange={(e) => setProfile({ ...profile, weightKg: Number(e.target.value) })} />
                </Field>
              </div>
              <Field label="Aktywność">
                <select
                  className={inputCls}
                  value={profile.activity}
                  onChange={(e) => setProfile({ ...profile, activity: e.target.value as Profile["activity"] })}
                >
                  {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Cel">
                <select
                  className={inputCls}
                  value={profile.goal}
                  onChange={(e) => setProfile({ ...profile, goal: e.target.value as Profile["goal"] })}
                >
                  {Object.entries(GOAL_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                className="w-full rounded-xl bg-[#111] py-3 text-[14px] font-medium text-white"
                onClick={() => {
                  saveProfile(profile);
                  applySuggested();
                }}
              >
                Policz cele z profilu
              </button>
            </section>

            <section className={`rounded-2xl ${card} p-4 space-y-3`}>
              <h2 className="text-[16px] font-semibold">Limity</h2>
              <p className={`text-[12px] ${muted}`}>Możesz poprawić to, co wyliczyło AI / wzór.</p>
              {(["kcal", "protein", "fat", "carbs"] as const).map((k) => (
                <Field key={k} label={k === "kcal" ? "Kalorie max" : k === "protein" ? "Białko max (g)" : k === "fat" ? "Tłuszcz (g)" : "Węgle (g)"}>
                  <input
                    type="number"
                    className={inputCls}
                    value={goals[k]}
                    onChange={(e) => setGoals({ ...goals, [k]: Number(e.target.value) })}
                  />
                </Field>
              ))}
              <Field label="Uwagi dla AI">
                <textarea
                  className={`${inputCls} min-h-[72px]`}
                  placeholder="np. bez laktozy, lubię owsiankę, 4 posiłki"
                  value={dietNotes}
                  onChange={(e) => setDietNotes(e.target.value)}
                />
              </Field>
              <button
                type="button"
                disabled={busy}
                className="w-full rounded-xl bg-[#00a86b] py-3 text-[14px] font-medium text-white disabled:opacity-50"
                onClick={() => {
                  saveProfile(profile);
                  saveGoals(goals);
                  void onDiet();
                }}
              >
                {busy ? "Układam dietę…" : "Ułóż dietę AI"}
              </button>
              {error && tab === "diet" && <p className="text-[13px] text-[#c45c5c]">{error}</p>}
            </section>

            {diet && (
              <section className={`rounded-2xl ${card} p-4`}>
                <h2 className="text-[16px] font-semibold">{diet.title || "Plan"}</h2>
                <p className={`mt-1 text-[13px] ${muted}`}>{diet.summary}</p>
                <div className="mt-4 space-y-4">
                  {diet.days?.map((d) => (
                    <div key={d.label}>
                      <div className="mb-2 text-[13px] font-medium">{d.label}</div>
                      {MEALS.map((m) => (
                        <div key={m} className="mb-2">
                          <div className={`text-[11px] uppercase tracking-wide ${muted}`}>{MEAL_LABELS[m]}</div>
                          {(d.meals?.[m] ?? []).map((item, i) => (
                            <div key={`${item.name}-${i}`} className="flex justify-between py-1 text-[13px]">
                              <span className="pr-3">{item.name} · {item.grams} g</span>
                              <span className={muted}>{item.kcal} kcal</span>
                            </div>
                          ))}
                          {(d.meals?.[m] ?? []).length > 0 && (
                            <button
                              type="button"
                              className="mb-2 text-[12px] text-[#00a86b]"
                              onClick={() => {
                                setDay(
                                  addItems(
                                    date,
                                    m,
                                    d.meals[m].map((item) => ({ ...item, id: uid() })),
                                  ),
                                );
                                setTab("diary");
                              }}
                            >
                              Dodaj do dzisiejszego dziennika
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "water" && (
          <section className={`rounded-2xl ${card} p-5`}>
            <div className="text-center">
              <div className={`text-[12px] ${muted}`}>Wypite dziś</div>
              <div className="mt-1 text-[40px] font-semibold tracking-tight">{day.waterMl}</div>
              <div className={`text-[13px] ${muted}`}>z {profile.waterGoal} ml</div>
            </div>
            <div className={`mt-4 h-2 overflow-hidden rounded-full ${dark ? "bg-white/10" : "bg-[#eee]"}`}>
              <div
                className="h-full rounded-full bg-[#3b9eff]"
                style={{ width: `${Math.min(100, (day.waterMl / profile.waterGoal) * 100 || 0)}%` }}
              />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[profile.glassMl, 330, 500].map((ml) => (
                <button
                  key={ml}
                  type="button"
                  className={`rounded-xl py-3 text-[14px] ${dark ? "bg-white/10" : "bg-[#f4f5f7]"}`}
                  onClick={() => setDay(addWater(date, ml))}
                >
                  + {ml} ml
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className={inputCls}
                placeholder="Własne ml"
                inputMode="numeric"
                value={customMl}
                onChange={(e) => setCustomMl(e.target.value)}
              />
              <button
                type="button"
                className="rounded-xl bg-[#3b9eff] px-4 text-[14px] font-medium text-white"
                onClick={() => {
                  const ml = Number(customMl);
                  if (!ml) return;
                  setDay(addWater(date, ml));
                  setCustomMl("");
                }}
              >
                Dodaj
              </button>
            </div>
            <button
              type="button"
              className={`mt-3 w-full text-[13px] ${muted}`}
              onClick={() => setDay(addWater(date, -profile.glassMl))}
            >
              Cofnij szklankę
            </button>
            <Field label="Cel wody (ml)">
              <input
                type="number"
                className={`${inputCls} mt-3`}
                value={profile.waterGoal}
                onChange={(e) => {
                  const next = { ...profile, waterGoal: Number(e.target.value) };
                  setProfile(next);
                  saveProfile(next);
                }}
              />
            </Field>
          </section>
        )}

        {tab === "keys" && (
          <div className="space-y-4">
            <section className={`rounded-2xl ${card} p-4`}>
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-[16px] font-semibold">Klucze</h2>
                  <p className={`mt-1 text-[12px] ${muted}`}>
                    Wklej i dodaj. Rotują się same.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[22px] font-semibold leading-none">{keyRows.length}</div>
                  <div className={`text-[11px] ${muted}`}>na zmianę</div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  className={`${inputCls} font-mono text-[13px]`}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="sk-or-v1-…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="shrink-0 rounded-xl bg-[#00a86b] px-4 text-[14px] font-medium text-white"
                  onClick={() => {
                    if (!newKey.trim()) return;
                    addKeys(newKey);
                    setNewKey("");
                    setKeyRows(keyStates());
                    setSettings(loadSettings());
                  }}
                >
                  Dodaj
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {keyRows.length === 0 && (
                  <p className={`py-6 text-center text-[13px] ${muted}`}>
                    Brak kluczy. Wklej OpenRouter i kliknij Dodaj.
                  </p>
                )}
                {keyRows.map((row) => (
                  <div
                    key={row.key}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 ${dark ? "bg-white/5" : "bg-[#f7f7f8]"}`}
                  >
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-[#00a86b] text-[12px] font-semibold text-white">
                      {row.slot}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[13px]">{row.label}</div>
                      <div className={`text-[11px] ${row.paused ? "text-[#c45c5c]" : "text-[#00a86b]"}`}>
                        {row.paused ? "Pauza — limit" : "Aktywny"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-[12px] text-[#c45c5c]"
                      onClick={() => {
                        removeKey(row.key);
                        setKeyRows(keyStates());
                      }}
                    >
                      Usuń
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <section className={`rounded-2xl ${card} p-4 space-y-3`}>
              <h2 className="text-[16px] font-semibold">Wygląd</h2>
              <div className="grid grid-cols-2 gap-2">
                {(["light", "dark"] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    className={`rounded-xl py-3 text-[14px] ${settings.theme === theme ? "bg-[#00a86b] text-white" : dark ? "bg-white/10" : "bg-[#f4f5f7]"}`}
                    onClick={() => {
                      const next = { ...settings, theme };
                      setSettings(next);
                      saveSettings(next);
                    }}
                  >
                    {theme === "light" ? "Jasny" : "Ciemny"}
                  </button>
                ))}
              </div>
            </section>
            <section className={`rounded-2xl ${card} p-4`}>
              <h2 className="text-[16px] font-semibold">iPhone</h2>
              <p className={`mt-2 text-[13px] leading-5 ${muted}`}>
                Safari → Udostępnij → Dodaj do ekranu początkowego. Klucze zostają tylko na tym telefonie.
              </p>
            </section>
          </div>
        )}
      </main>

      <nav className={`fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t ${line} ${dark ? "bg-[#111]" : "bg-white"} px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1`}>
        <div className="grid grid-cols-5 items-center">
          <Nav icon="☰" label="Dziennik" active={tab === "diary"} onClick={() => setTab("diary")} />
          <Nav icon="✦" label="Dieta" active={tab === "diet"} onClick={() => setTab("diet")} />
          <button
            type="button"
            aria-label="Dodaj"
            onClick={() => setSheet("add")}
            className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#00a86b] text-2xl leading-none text-white"
          >
            +
          </button>
          <Nav icon="○" label="Woda" active={tab === "water"} onClick={() => setTab("water")} />
          <Nav icon="⌥" label="Klucze" active={tab === "keys"} onClick={() => setTab("keys")} />
        </div>
      </nav>

      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
      <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />

      {sheet !== "closed" && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => !busy && setSheet("closed")}>
          <div
            className={`absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl ${dark ? "bg-[#1c1c1e]" : "bg-white"} p-5 pb-[max(20px,env(safe-area-inset-bottom))]`}
            onClick={(e) => e.stopPropagation()}
          >
            {busy && (
              <div className="py-8 text-center text-[14px] text-[#8e8e93]">AI liczy…</div>
            )}
            {!busy && sheet === "add" && (
              <>
                <h3 className="text-[17px] font-semibold">Dodaj</h3>
                <input
                  className={`${inputCls} mt-3`}
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder="Opcjonalnie: co jest na talerzu"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" className="rounded-xl bg-[#00a86b] py-3 text-[14px] font-medium text-white" onClick={() => camRef.current?.click()}>Zdjęcie</button>
                  <button type="button" className={`rounded-xl py-3 text-[14px] ${dark ? "bg-white/10" : "bg-[#f4f5f7]"}`} onClick={() => galRef.current?.click()}>Galeria</button>
                  <button type="button" className={`rounded-xl py-3 text-[14px] ${dark ? "bg-white/10" : "bg-[#f4f5f7]"}`} onClick={() => setSheet("search")}>Szukaj</button>
                  <button type="button" className={`rounded-xl py-3 text-[14px] ${dark ? "bg-white/10" : "bg-[#f4f5f7]"}`} onClick={() => setSheet("manual")}>Ręcznie</button>
                </div>
                {error && <p className="mt-3 text-[13px] text-[#c45c5c]">{error}</p>}
              </>
            )}
            {!busy && sheet === "review" && review && (
              <>
                <h3 className="text-[17px] font-semibold">Sprawdź</h3>
                {preview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="mt-3 h-32 w-full rounded-xl object-cover" />
                )}
                <p className={`mt-2 text-[13px] ${muted}`}>{review.summary}</p>
                <div className="mt-3 flex gap-1 overflow-x-auto">
                  {MEALS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMeal(m)}
                      className={`rounded-full px-3 py-1 text-[12px] ${meal === m ? "bg-[#00a86b] text-white" : dark ? "bg-white/10" : "bg-[#f4f5f7]"}`}
                    >
                      {MEAL_LABELS[m]}
                    </button>
                  ))}
                </div>
                <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {review.items.map((item, i) => (
                    <div key={`${item.name}-${i}`} className="flex justify-between text-[13px]">
                      <span>{item.name} · {item.grams} g</span>
                      <span className={muted}>{item.kcal}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className="mt-4 w-full rounded-xl bg-[#00a86b] py-3 text-[14px] font-medium text-white" onClick={() => commit(review.items, preview)}>
                  Dodaj do dziennika
                </button>
              </>
            )}
            {!busy && sheet === "manual" && (
              <>
                <h3 className="text-[17px] font-semibold">Wpis ręczny</h3>
                <div className="mt-3 space-y-2">
                  {(["name", "grams", "kcal", "protein", "fat", "carbs"] as const).map((field) => (
                    <input
                      key={field}
                      className={inputCls}
                      value={manual[field]}
                      placeholder={field === "name" ? "Nazwa" : field}
                      onChange={(e) => setManual({ ...manual, [field]: e.target.value })}
                    />
                  ))}
                </div>
                <div className="mt-3 flex gap-1 overflow-x-auto">
                  {MEALS.map((m) => (
                    <button key={m} type="button" onClick={() => setMeal(m)} className={`rounded-full px-3 py-1 text-[12px] ${meal === m ? "bg-[#00a86b] text-white" : dark ? "bg-white/10" : "bg-[#f4f5f7]"}`}>
                      {MEAL_LABELS[m]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-4 w-full rounded-xl bg-[#00a86b] py-3 text-[14px] font-medium text-white"
                  onClick={() => {
                    if (!manual.name) return;
                    commit([{
                      name: manual.name,
                      grams: Number(manual.grams) || 100,
                      kcal: Number(manual.kcal) || 0,
                      protein: Number(manual.protein) || 0,
                      fat: Number(manual.fat) || 0,
                      carbs: Number(manual.carbs) || 0,
                    }]);
                    setManual({ name: "", grams: "100", kcal: "", protein: "", fat: "", carbs: "" });
                  }}
                >
                  Zapisz
                </button>
              </>
            )}
            {!busy && sheet === "search" && (
              <>
                <h3 className="text-[17px] font-semibold">Szukaj</h3>
                <div className="mt-3 flex gap-2">
                  <input className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="np. twaróg 200 g" />
                  <button type="button" className="rounded-xl bg-[#00a86b] px-4 text-white" onClick={() => void onSearch()}>OK</button>
                </div>
                <div className="mt-3 flex gap-1 overflow-x-auto">
                  {MEALS.map((m) => (
                    <button key={m} type="button" onClick={() => setMeal(m)} className={`rounded-full px-3 py-1 text-[12px] ${meal === m ? "bg-[#00a86b] text-white" : dark ? "bg-white/10" : "bg-[#f4f5f7]"}`}>
                      {MEAL_LABELS[m]}
                    </button>
                  ))}
                </div>
                <div className="mt-3 max-h-56 space-y-1 overflow-y-auto">
                  {hits.map((item, i) => (
                    <button key={`${item.name}-${i}`} type="button" className="flex w-full justify-between py-2 text-left text-[13px]" onClick={() => commit([item])}>
                      <span>{item.name}</span>
                      <span className={muted}>{item.kcal} kcal</span>
                    </button>
                  ))}
                </div>
                {error && <p className="mt-2 text-[13px] text-[#c45c5c]">{error}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Nav({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`py-1 text-center ${active ? "text-[#00a86b]" : "text-[#8e8e93]"}`}>
      <div className="text-[15px] leading-none">{icon}</div>
      <div className="mt-1 text-[10px]">{label}</div>
    </button>
  );
}

