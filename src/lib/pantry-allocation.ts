// ===== 已完成菜谱用量的 FIFO 分摊 =====
// 修复 bug：旧逻辑把每个已完成菜谱的用量从「每一个同名食材条目」上各扣一遍，
// 导致同名食材存在多条记录（多批次）时重复扣减——新买的食材也会被历史菜谱扣到 0。
// 正确语义：每份用量只扣一次，按购买时间（createdAt 升序）先扣最早的批次（FIFO），
// 且只有「菜谱完成之前就已存在」的批次才承担该次扣减（之后买的是新批次）。
import type { PantryItem, Recipe, RecipeItem, PantryStatus, PantryCategory, LossReason, PantryLoss } from '../types';
import { parseQuantity, formatQuantity, unitsMatch, addFraction, subtractFraction } from './quantity';

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

  // 参与分摊的批次：仅"现有(active)"真实食材，虚拟待买项与"已用完(checked)"批次不参与
  // 修复 bug：旧逻辑把 checked（已用完）批次也纳入 FIFO 扣减池，且因其购买时间最早会优先被扣。
  // 但 checked 批次在食材库展示层被隐藏、语义上已被用户确认消耗完，扣减落在它身上会让
  // 用户实际看到的"现有"批次数量不变 → 表现为"完成菜谱后食材库没同步"。
  // 正确语义：只有 active 批次有真实剩余库存，应承担扣减。
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
    if (item.status !== 'active') continue;
    const parsed = parseQuantity(item.quantity);
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

    // 只有「菜谱完成前」就已存在的批次才承担扣减（FIFO，保护新买的批次不被历史菜谱误扣）。
    // 这是关键的防回归约束：若允许历史已完成菜谱扣减「之后才买入」的新批次，
    // 会导致大量新批次被旧菜谱扣到 0（曾在两阶段分摊改动中引发大面积库存清零）。
    // completedAt 缺失的旧菜谱：退化为所有批次均可扣（与旧行为兼容）。
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

// ===== 虚拟待买项：根据活跃菜谱的食材需求，自动生成「待购买」清单 =====
// 修复 bug：旧逻辑对无法解析数量的食材（适量/少许/若干/留空）直接跳过，
// 导致这类食材不会出现在食材库「待购买」里。
// 现在：解析不到数字的食材按「定性用量」处理——只要食材库里没有，就生成待购买项，
// 数量为原始文本（如「适量」），让用户不会漏买。
interface Demand {
  totalNum: number;
  totalDen: number;
  unit: string;
  isFraction: boolean;
  qualitative: boolean; // 是否含有无法解析数量的条目（适量/少许等）
  rawText: string;      // 定性用量时展示的原始文本
}

export function buildVirtualToBuyItems(
  pantryItems: PantryItem[],
  recipeItems: RecipeItem[],
  recipes: Recipe[],
  completedAllocations: CompletedAllocations,
  autoCategorize: (name: string) => PantryCategory,
  userId: string = '',
): PantryItem[] {
  const existingNames = new Set(
    pantryItems
      .filter(p => p.status === 'active' || p.status === 'to_buy')
      .map(p => canonicalName(p.name))
  );
  const activeRecipeIds = new Set(recipes.filter(r => r.active !== false).map(r => r.id));
  const virtualItems: PantryItem[] = [];
  const seenNames = new Set<string>();

  // 按归一化名称汇总：活跃菜谱对每种食材的总需求量
  const activeDemandMap = new Map<string, Demand>();
  for (const ri of recipeItems) {
    if (!activeRecipeIds.has(ri.recipeId)) continue;
    const parsed = parseQuantity(ri.quantity);
    const cName = canonicalName(ri.name);
    const existing = activeDemandMap.get(cName);
    if (existing) {
      if (parsed && unitsMatch(existing.unit, parsed.unit)) {
        const added = addFraction(existing.totalNum, existing.totalDen, parsed.numerator, parsed.denominator);
        existing.totalNum = added.num;
        existing.totalDen = added.den;
        existing.isFraction = existing.isFraction || parsed.isFraction || parsed.isHalf;
      }
      if (!parsed) existing.qualitative = true;
    } else {
      activeDemandMap.set(cName, {
        totalNum: parsed?.numerator ?? 0,
        totalDen: parsed?.denominator ?? 1,
        unit: parsed?.unit ?? '',
        isFraction: parsed?.isFraction || parsed?.isHalf || false,
        qualitative: !parsed,
        rawText: ri.quantity?.trim() || '适量',
      });
    }
  }

  for (const [name, demand] of activeDemandMap) {
    if (!existingNames.has(name)) {
      // 食材不存在 → 生成虚拟待买项
      if (!seenNames.has(name)) {
        seenNames.add(name);
        const qtyText = demand.qualitative
          ? demand.rawText
          : formatQuantity(demand.totalNum, demand.totalDen, demand.isFraction) + demand.unit;
        virtualItems.push({
          id: `virtual-${name}`,
          userId,
          name,
          quantity: qtyText,
          status: 'to_buy' as PantryStatus,
          category: autoCategorize(name),
          createdAt: '',
          isVirtual: true,
        });
      }
    } else {
      // 食材存在 → 若用量为定性（适量/少许）则默认已有，不提示购买
      if (demand.qualitative) continue;
      const matchingItems = pantryItems.filter(p => p.status === 'active' && canonicalName(p.name) === name);
      if (matchingItems.length === 0) continue;

      let availNum = 0;
      let availDen = 1;
      let hasAny = false;
      for (const mi of matchingItems) {
        const op = parseQuantity(mi.quantity);
        if (!op || !unitsMatch(op.unit, demand.unit)) continue;

        let remNum = op.numerator;
        let remDen = op.denominator;
        const alloc = completedAllocations.deductions.get(mi.id);
        if (alloc) {
          const r = subtractFraction(remNum, remDen, alloc.num, alloc.den);
          remNum = r.num;
          remDen = r.den;
        }

        const added = addFraction(availNum, availDen, remNum, remDen);
        availNum = added.num;
        availDen = added.den;
        hasAny = true;
      }
      if (!hasAny) continue;

      const shortfall = subtractFraction(demand.totalNum, demand.totalDen, availNum, availDen);
      if (shortfall.num > 0) {
        if (!seenNames.has(name)) {
          seenNames.add(name);
          virtualItems.push({
            id: `virtual-shortfall-${name}`,
            userId,
            name,
            quantity: formatQuantity(shortfall.num, shortfall.den, demand.isFraction) + demand.unit,
            status: 'to_buy' as PantryStatus,
            category: autoCategorize(name),
            createdAt: '',
            isVirtual: true,
          });
        }
      }
    }
  }

  return virtualItems;
}

// ===== 活跃菜谱的「需用」需求收集 =====
// 修复 bug：旧逻辑只在「虚拟扣减后剩余量 >= 0」时才把活跃菜谱列入食材详情页的「需用」列表，
// 导致排在后面的菜谱（即使食材库里已有）被隐藏，出现「做菜页显示已有，食材详情页却看不到」
// 的不一致。正确语义：所有活跃菜谱的需求都应显示；不够时标记 insufficient，而不是隐藏。
export interface ActiveNeededUsage {
  recipeId: string;
  recipeTitle: string;
  quantity: string;
}

// ===== 损耗计算（部分损耗，如变质/过期/做坏） =====
// 编辑食材数量时，若新数量 < 旧数量且单位一致，则把"减少的部分"记成一条损耗记录。
// 数量不变 / 增加（视为录入修正）则返回 null，不记损耗。
export function computeLossFromEdit(
  oldQty: string,
  newQty: string,
  reason: LossReason | undefined,
  id: string,
): PantryLoss | null {
  if (!reason) return null; // 无原因 = 非损耗（普通修正数量），不记损耗
  const oldParsed = parseQuantity(oldQty);
  const newParsed = parseQuantity(newQty);
  if (!oldParsed || !newParsed || !unitsMatch(oldParsed.unit, newParsed.unit)) return null;
  const diff = subtractFraction(oldParsed.numerator, oldParsed.denominator, newParsed.numerator, newParsed.denominator);
  if (diff.num <= 0) return null;
  const quantity = formatQuantity(diff.num, diff.den, oldParsed.isFraction || oldParsed.isHalf) + oldParsed.unit;
  return { id, quantity, reason, createdAt: new Date().toISOString() };
}

// ===== 损耗量归一化：缺单位时借用基准单位；返回损耗记录的 quantity 文本 =====
export function normalizeLossQuantity(lossText: string, baseQty: string): string {
  const base = parseQuantity(baseQty);
  const lp = parseQuantity(lossText);
  if (!lp) return lossText.trim();
  if (!lp.unit && base && base.unit) {
    return formatQuantity(lp.numerator, lp.denominator, lp.isFraction || lp.isHalf) + base.unit;
  }
  return formatQuantity(lp.numerator, lp.denominator, lp.isFraction || lp.isHalf) + lp.unit;
}

// 构造一条损耗记录（损耗量 = 用户录入的 lossText，单位归一到基准）
export function makeLossRecord(id: string, lossText: string, baseQty: string, reason: LossReason): PantryLoss {
  return {
    id,
    quantity: normalizeLossQuantity(lossText, baseQty),
    reason,
    createdAt: new Date().toISOString(),
  };
}

// 重算损耗后的当前库存（不含 FIFO，FIFO 在显示层实时扣）：
// 当前库存 = 采购基数 originalQuantity − 所有损耗量之和（单位一致才减，否则跳过该条）
export function recomputeQuantityAfterLosses(item: PantryItem): string {
  const base = parseQuantity(item.originalQuantity || item.quantity);
  if (!base) return item.quantity;
  let num = base.numerator;
  let den = base.denominator;
  let useFraction = base.isFraction || base.isHalf;
  for (const l of item.losses || []) {
    const lp = parseQuantity(l.quantity);
    if (!lp || !unitsMatch(lp.unit, base.unit)) continue;
    const r = subtractFraction(num, den, lp.numerator, lp.denominator);
    num = r.num; den = r.den;
  }
  if (num < 0) { num = 0; den = 1; }
  return formatQuantity(num, den, useFraction) + base.unit;
}

// ===== 损耗对「当前库存(item.quantity)」的加减 =====
// 模型：quantity 是当前库存的唯一真相；记录一条损耗 = 从 quantity 扣减该量；
// 删除一条损耗 = 把该量加回 quantity。不再依赖 originalQuantity（历史版本曾覆盖它导致重复扣减）。
export function subtractLossFromStock(baseQty: string, lossQty: string): string {
  const base = parseQuantity(baseQty);
  const loss = parseQuantity(lossQty);
  if (!base || !loss || !unitsMatch(base.unit, loss.unit)) return baseQty; // 单位不一致不串减
  const r = subtractFraction(base.numerator, base.denominator, loss.numerator, loss.denominator);
  const num = r.num < 0 ? 0 : r.num;
  const den = r.num < 0 ? 1 : r.den;
  return formatQuantity(num, den, base.isFraction || base.isHalf) + base.unit;
}

export function addLossToStock(baseQty: string, lossQty: string): string {
  const base = parseQuantity(baseQty);
  const loss = parseQuantity(lossQty);
  if (!base || !loss || !unitsMatch(base.unit, loss.unit)) return baseQty;
  const r = addFraction(base.numerator, base.denominator, loss.numerator, loss.denominator);
  return formatQuantity(r.num, r.den, base.isFraction || base.isHalf) + base.unit;
}

// ===== 撤销单条损耗登记（删除损耗记录并加回库存） =====
// 场景：用户误登记了一条损耗（如本想记 60g，结果记成 640g 导致食材归零），
// 希望删掉这条记录、让库存回到「登记这条损耗之前」。
//
// 数据模型：每次登记损耗时，editPantryItem 会把 originalQuantity 同步成「剩余量」
// （即 originalQuantity 已被损耗覆盖，不再是真原始入库量）。但损耗记录是完整累加的，
// 所以「真原始库存 = 当前库存 + 所有损耗量之和」。删除某条损耗 loss[i] 时：
//   新库存 = 当前库存 + loss[i] 的量
//   新 losses = losses 去掉 loss[i]
// 删除全部损耗 → 加回全部损耗量 → 恢复到真原始库存。数学上可证一致。
//
// 单位不一致（如库存 500g、损耗记录 2个）则不串加，仅删除记录、不动数量，避免脏数据。
export interface RevertLossResult {
  quantity: string;
  originalQuantity: string;
  losses: PantryLoss[];
}

export function revertLoss(
  item: PantryItem,
  lossId: string,
): RevertLossResult | null {
  const losses = item.losses || [];
  const target = losses.find(l => l.id === lossId);
  if (!target) return null;

  const recovered = parseQuantity(target.quantity);
  const base = parseQuantity(item.originalQuantity || item.quantity);

  let newQty = item.quantity;
  let newOriginal = item.originalQuantity || item.quantity;
  // 单位一致才把损耗量加回库存；否则只删记录、不串单位
  if (recovered && base && unitsMatch(recovered.unit, base.unit)) {
    const added = addFraction(base.numerator, base.denominator, recovered.numerator, recovered.denominator);
    const str = formatQuantity(added.num, added.den, base.isFraction || base.isHalf) + base.unit;
    newQty = str;
    newOriginal = str;
  }

  return {
    quantity: newQty,
    originalQuantity: newOriginal,
    losses: losses.filter(l => l.id !== lossId),
  };
}

export function collectActiveNeededUsages(
  item: PantryItem,
  matchingRIs: RecipeItem[],
  recipes: Recipe[],
  originalParsed: ReturnType<typeof parseQuantity>,
): { usages: ActiveNeededUsage[]; activeRemainingNum: number; activeRemainingDen: number; insufficient: boolean } {
  const usages: ActiveNeededUsage[] = [];
  let activeRemainingNum = originalParsed?.numerator ?? 0;
  let activeRemainingDen = originalParsed?.denominator ?? 1;
  let insufficient = false;

  for (const ri of matchingRIs) {
    const recipe = recipes.find(r => r.id === ri.recipeId);
    if (!recipe || recipe.active === false) continue;

    const recipeParsed = parseQuantity(ri.quantity);
    const isUnitsMatch = originalParsed && recipeParsed && unitsMatch(originalParsed.unit, recipeParsed.unit);

    if (isUnitsMatch) {
      const result = subtractFraction(activeRemainingNum, activeRemainingDen, recipeParsed.numerator, recipeParsed.denominator);
      if (result.num >= 0) {
        activeRemainingNum = result.num;
        activeRemainingDen = result.den;
      } else {
        insufficient = true;
      }
    }

    usages.push({
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      quantity: ri.quantity,
    });
  }

  return { usages, activeRemainingNum, activeRemainingDen, insufficient };
}
