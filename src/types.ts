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

// ===== 食材库 & 做菜功能类型 =====

export type PantryStatus = 'active' | 'to_buy' | 'checked';

export interface PantryItem {
  id: string;
  userId: string;
  name: string;
  quantity: string;
  status: PantryStatus;
  createdAt: string;
  isVirtual?: boolean;
}

export interface Recipe {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
}

export interface RecipeItem {
  id: string;
  recipeId: string;
  name: string;
  quantity: string;
}

// 食材使用记录（实时计算，不存储）
export interface PantryUsage {
  recipeId: string;
  recipeTitle: string;
  recipeItemName: string;
  recipeItemQuantity: string;
}

// 菜谱食材匹配状态（实时计算）
export type RecipeItemMatchStatus = 'matched' | 'to_buy';

export interface RecipeItemWithMatch extends RecipeItem {
  matchStatus: RecipeItemMatchStatus;
  matchedPantryItem?: PantryItem;
}

export type ViewMode = 'calendar' | 'list' | 'stats' | 'pantry' | 'cooking';
