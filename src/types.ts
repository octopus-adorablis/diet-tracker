export interface NutritionItem {
  name: string;
  weight: number;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
  note?: string;
}

export interface EvaluationItem {
  name: string;
  value: string;
  target: string;
  status: 'good' | 'warning' | 'danger';
  statusText: string;
  icon: string;
}

export interface MealEvaluation {
  score: number;
  scoreLabel: string;
  items: EvaluationItem[];
  highlights: string[];
  suggestions: string[];
}

export interface MealData {
  id?: string;
  user_id?: string;
  date: string;
  type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  typeName: string;
  time: string;
  content: string;
  items: NutritionItem[];
  total: {
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
    fiber: number;
  };
  evaluation: MealEvaluation;
  created_at?: string;
}

export interface AIMealImport {
  date?: string;
  type?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  typeName?: string;
  time?: string;
  content: string;
  items: NutritionItem[];
  total: {
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
    fiber: number;
  };
  evaluation: MealEvaluation;
}

export type ViewMode = 'calendar' | 'list' | 'stats';
