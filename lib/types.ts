export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type FoodItem = {
  id: string;
  name: string;
  brand?: string;
  grams: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  photo?: string;
  note?: string;
};

export type DayLog = {
  date: string;
  meals: Record<MealType, FoodItem[]>;
  waterMl: number;
};

export type Goals = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type Activity = "low" | "light" | "mid" | "high" | "very";
export type GoalType = "lose" | "maintain" | "gain";

export type Profile = {
  name: string;
  sex: "female" | "male" | "other";
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  goal: GoalType;
  waterGoal: number;
  glassMl: number;
};

export type PlannedFood = {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type DietPlan = {
  title: string;
  summary: string;
  days: {
    label: string;
    meals: Record<MealType, PlannedFood[]>;
  }[];
};

export type AnalyzeResult = {
  mealGuess: MealType;
  items: Omit<FoodItem, "id" | "photo">[];
  summary: string;
  confidence: number;
};

export type Settings = {
  theme: "light" | "dark";
  keys: string[];
};
