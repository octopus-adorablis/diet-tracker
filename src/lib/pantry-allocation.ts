// ===== 已完成菜谱用量的 FIFO 分摊 =====
// 修复 bug：旧逻辑把每个已完成菜谱的用量从「每一个同名食材条目」上各扣一遍，
// 导致同名食材存在多条记录（多批次）时重复扣减——新买的食材也会被历史菜谱扣到 0。
// 正确语义：每份用量只扣一次，按购买时间（createdAt 升序）先扣最早的批次（FIFO），
// 且只有「菜谱完成之前就已存在」的批次才承担该次扣减（之后买的是新批次）。
import type { PantryItem, Recipe, RecipeItem } from '../types';
import { parseQuantity, unitsMatch, addFraction, subtractFraction } from './quantity';

// 同义词归一化：不同写法的同一食材视为同一个，用于食材库与菜谱的匹配
// 键=别名，值=标准名（匹配时统一映射到标准名比较）
const NAME_SYNONYMS: Record<string, string> = {
  '西红柿': '番茄',
  '圣女果': '小番茄',
};
export function canonicalName(name: string): string {
  const trimmed = name.trim();
  return NAME_SYNONYMS[trimmed] ?? trimmed;
}

export interface CompletedAllocations {
  /** pantryItemId → 该批次累计被已完成菜谱扣减的量 */
  deductions: Map<string, { num: number; den: number }>;
  /** pantryItemId → 实际承担了扣减的 recipeItemId 集合（用于使用记录展示） */
  allocatedRecipeItemIds: Map<string, Set<string>>;
  /** 扣减不够（菜谱用量超过当时所有批次库存）的食材批次 */
  insufficientIds: Set<string>;
}

export function allocateCompletedUsage(
  realItems: PantryItem[],
  recipeItems: RecipeItem[],
  recipes: Recipe[],
): CompletedAllocations {
  const deductions = new Map<string, { num: number; den: number }>();
  const allocatedRecipeItemIds = new Map<string, Set<string>>();
  const insufficientIds = new Set<string>();
  const recipeById = new Map(recipes.map(r => [r.id, r]));

  // 收集已完成菜谱的食材，按完成时间从早到晚依次分摊
  const completed: { ri: RecipeItem; completedAt: string; num: number; den: number }[] = [];
  for (const ri of recipeItems) {
    const recipe = recipeById.get(ri.recipeId);
    if (!recipe || recipe.active !== false) continue;
    const parsed = parseQuantity(ri.quantity);
    if (!parsed) continue;
    completed.push({ ri, completedAt: recipe.completedAt || '', num: parsed.numerator, den: parsed.denominator });
  }
  if (completed.length === 0) return { deductions, allocatedRecipeItemIds, insufficientIds };
  completed.sort((a, b) => a.completedAt.localeCompare(b.completedAt));

  // 参与分摊的批次：真实食材（现有 + 已用完），虚拟待买项不参与
  // 每个批次的可扣池 = 原始数量，跨多次分摊共享（先到先得）
  interface Pool {
    item: PantryItem;
    num: number;
    den: number;
    unit: string;
    created: string;
  }
  const poolsByName = new Map<string, Pool[]>();
  for (const item of realItems) {
    if (item.isVirtual || item.id.startsWith('virtual-')) continue;
    if (item.status !== 'active' && item.status !== 'checked') continue;
    const parsed = parseQuantity(item.originalQuantity || item.quantity);
    if (!parsed) continue;
    const cName = canonicalName(item.name);
    if (!poolsByName.has(cName)) poolsByName.set(cName, []);
    poolsByName.get(cName)!.push({
      item,
      num: parsed.numerator,
      den: parsed.denominator,
      unit: parsed.unit,
      created: item.createdAt || '',
    });
  }
  // 同名批次按购买时间从早到晚（FIFO）；缺失时间信息的旧数据视为最早
  for (const pools of poolsByName.values()) {
    pools.sort((a, b) => a.created.localeCompare(b.created));
  }

  for (const { ri, completedAt, num: needNum, den: needDen } of completed) {
    const pools = poolsByName.get(canonicalName(ri.name));
    if (!pools || pools.length === 0) continue;

    // 只有菜谱完成前就存在的批次才承担扣减（之后买的属于新批次，不被历史菜谱误扣）
    // completedAt 缺失的旧菜谱：退化为所有批次均可扣（与旧行为兼容）
    const eligible = completedAt
      ? pools.filter(p => !p.created || p.created <= completedAt)
      : pools;
    if (eligible.length === 0) continue;

    let leftNum = needNum;
    let leftDen = needDen;
    let lastTaker: Pool | null = null;
    for (const pool of eligible) {
      if (leftNum === 0) break;
      // 单位一致才可扣（g 与 克 互通）
      const rp = parseQuantity(ri.quantity);
      if (!rp || !unitsMatch(pool.unit, rp.unit)) continue;
      if (pool.num <= 0) continue;

      // take = min(批次余量, 剩余待扣量)
      const poolVal = pool.num / pool.den;
      const leftVal = leftNum / leftDen;
      let takeNum: number;
      let takeDen: number;
      if (poolVal <= leftVal) {
        takeNum = pool.num; takeDen = pool.den;
      } else {
        takeNum = leftNum; takeDen = leftDen;
      }

      const afterPool = subtractFraction(pool.num, pool.den, takeNum, takeDen);
      pool.num = afterPool.num; pool.den = afterPool.den;
      const afterLeft = subtractFraction(leftNum, leftDen, takeNum, takeDen);
      leftNum = afterLeft.num; leftDen = afterLeft.den;
      lastTaker = pool;

      const prev = deductions.get(pool.item.id) || { num: 0, den: 1 };
      deductions.set(pool.item.id, addFraction(prev.num, prev.den, takeNum, takeDen));

      let set = allocatedRecipeItemIds.get(pool.item.id);
      if (!set) {
        set = new Set<string>();
        allocatedRecipeItemIds.set(pool.item.id, set);
      }
      set.add(ri.id);
    }
    // 所有批次扣完仍不够 → 最后承担扣减的批次标记「不够了」
    if (leftNum > 0 && lastTaker) {
      insufficientIds.add(lastTaker.item.id);
    }
  }

  return { deductions, allocatedRecipeItemIds, insufficientIds };
}
