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

// 食材分类（四象限）
export type PantryCategory = 'meat_dairy' | 'vegetable' | 'staple' | 'other';

export interface PantryItem {
  id: string;
  userId: string;
  name: string;
  quantity: string;          // 原始数量（用户录入值，永不被代码修改）
  status: PantryStatus;
  category: PantryCategory;
  createdAt: string;
  sortOrder?: number;
  isVirtual?: boolean;
  usedQuantity?: string;      // 旧字段，已废弃，保留向后兼容
  originalQuantity?: string; // 原始数量备份（迁移用，= quantity）
}

// 单条消耗记录
export interface ConsumptionRecord {
  r: string; // 菜谱名
  q: string; // 用量
  subtracted?: boolean;  // true=已从 quantity 中减去（不在"已使用"中重复显示）
  insufficient?: boolean; // true=不够减（显示红色"不够了"提示）
}

export interface Recipe {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  active?: boolean; // 是否激活（true=在做/提示买菜, false=已做完不再提示）
  sortOrder?: number;
}

export interface RecipeItem {
  id: string;
  recipeId: string;
  name: string;
  quantity: string;
}

// 单条菜谱使用信息（实时计算，不存储）
export interface PantryUsageInfo {
  recipeId: string;
  recipeTitle: string;
  quantity: string;          // 菜谱中的用量
  status: 'used' | 'needed'; // used=已完成菜谱(已用掉), needed=活跃菜谱(还没用)
  deducted: boolean;         // true=已从原始数量中扣减(单位一致且菜谱已完成)
}

// 食材显示信息（实时计算）
export interface PantryDisplayInfo {
  displayQuantity: string;   // 显示数量: "剩2/3根" 或 "2根"(原始)
  usages: PantryUsageInfo[];  // 所有使用此食材的菜谱列表
  insufficient: boolean;     // 已完成菜谱总用量 > 原始数量
}

// 菜谱食材匹配状态（实时计算）
export type RecipeItemMatchStatus = 'matched' | 'to_buy';

export interface RecipeItemWithMatch extends RecipeItem {
  matchStatus: RecipeItemMatchStatus;
  matchedPantryItem?: PantryItem;
}

export type ViewMode = 'calendar' | 'list' | 'stats' | 'pantry' | 'cooking';
