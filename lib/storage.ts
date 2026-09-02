import type {
  Activity,
  DayLog,
  DietPlan,
  FoodItem,
  GoalType,
  Goals,
  MealType,
  Profile,
  Settings,
} from "./types";

const STORAGE_KEY = "kalorix-v2";

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Śniadanie",
  lunch: "Obiad",
  dinner: "Kolacja",
  snack: "Przekąski",
};

export const ACTIVITY_LABELS: Record<Activity, string> = {
  low: "Siedzący",
  light: "Lekki 1–2×/tyg.",
  mid: "Umiarkowany 3–4×/tyg.",
  high: "Duży 5–6×/tyg.",
  very: "Bardzo duży",
};

export const GOAL_LABELS: Record<GoalType, string> = {
  lose: "Redukcja",
  maintain: "Utrzymanie",
  gain: "Masa",
};

const DEFAULT_GOALS: Goals = { kcal: 2200, protein: 140, fat: 70, carbs: 250 };

const DEFAULT_PROFILE: Profile = {
  name: "",
  sex: "female",
  age: 25,
  heightCm: 170,
  weightKg: 65,
  activity: "mid",
  goal: "maintain",
  waterGoal: 2500,
  glassMl: 250,
};

const DEFAULT_SETTINGS: Settings = { theme: "light", keys: [] };

export function todayISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function emptyDay(date: string): DayLog {
  return {
    date,
    meals: { breakfast: [], lunch: [], dinner: [], snack: [] },
    waterMl: 0,
  };
}

type Store = {
  goals: Goals;
  profile: Profile;
  settings: Settings;
  diet: DietPlan | null;
  days: Record<string, DayLog>;
};

function defaults(): Store {
  return {
    goals: DEFAULT_GOALS,
    profile: DEFAULT_PROFILE,
    settings: DEFAULT_SETTINGS,
    diet: null,
    days: {},
  };
}

function read(): Store {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacy = localStorage.getItem("kalorix-v1");
      if (!legacy) return defaults();
      const old = JSON.parse(legacy) as { goals?: Goals; days?: Record<string, DayLog> };
      const store: Store = {
        ...defaults(),
        goals: old.goals ?? DEFAULT_GOALS,
        days: Object.fromEntries(
          Object.entries(old.days ?? {}).map(([k, v]) => [
            k,
            { ...emptyDay(k), ...v, waterMl: v.waterMl ?? 0 },
          ]),
        ),
      };
      write(store);
      return store;
    }
    return { ...defaults(), ...JSON.parse(raw) } as Store;
  } catch {
    return defaults();
  }
}

function write(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function loadGoals() {
  return read().goals;
}
export function saveGoals(goals: Goals) {
  write({ ...read(), goals });
}
export function loadProfile() {
  return read().profile;
}
export function saveProfile(profile: Profile) {
  write({ ...read(), profile });
}
export function loadSettings() {
  return read().settings;
}
export function saveSettings(settings: Settings) {
  write({ ...read(), settings });
}
export function loadDiet() {
  return read().diet;
}
export function saveDiet(diet: DietPlan | null) {
  write({ ...read(), diet });
}
export function loadDay(date: string): DayLog {
  const day = read().days[date];
  return day ? { ...emptyDay(date), ...day, waterMl: day.waterMl ?? 0 } : emptyDay(date);
}
export function saveDay(day: DayLog) {
  const store = read();
  store.days[day.date] = day;
  write(store);
}
export function addItems(date: string, meal: MealType, items: FoodItem[]) {
  const day = loadDay(date);
  day.meals[meal] = [...day.meals[meal], ...items];
  saveDay(day);
  return day;
}
export function removeItem(date: string, meal: MealType, id: string) {
  const day = loadDay(date);
  day.meals[meal] = day.meals[meal].filter((item) => item.id !== id);
  saveDay(day);
  return day;
}
export function addWater(date: string, ml: number) {
  const day = loadDay(date);
  day.waterMl = Math.max(0, day.waterMl + ml);
  saveDay(day);
  return day;
}
export function totals(day: DayLog) {
  const items = Object.values(day.meals).flat();
  return items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      protein: acc.protein + item.protein,
      fat: acc.fat + item.fat,
      carbs: acc.carbs + item.carbs,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
}
export function weekDays(end = new Date()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(end);
    d.setDate(end.getDate() - (6 - i));
    return todayISO(d);
  });
}

export function suggestedGoals(profile: Profile): Goals {
  const { weightKg: w, heightCm: h, age, sex, activity, goal } = profile;
  const bmr =
    sex === "male" ? 10 * w + 6.25 * h - 5 * age + 5 : 10 * w + 6.25 * h - 5 * age - 161;
  const mult = { low: 1.2, light: 1.375, mid: 1.55, high: 1.725, very: 1.9 }[activity];
  let kcal = bmr * mult;
  if (goal === "lose") kcal *= 0.82;
  if (goal === "gain") kcal *= 1.12;
  kcal = Math.round(kcal / 10) * 10;
  const protein = Math.round(w * (goal === "lose" ? 2.0 : 1.8));
  const fat = Math.round(w * 0.9);
  const carbs = Math.max(80, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs };
}
