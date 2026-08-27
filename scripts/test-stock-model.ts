// 仿真测试：验证「损耗模型（originalQuantity 不可变）」与「FIFO 两阶段分摊」
// 修复 Bug1（茄子损耗登记变 0）与 Bug2（柠檬老批次误标不够了）。
// 用法：esbuild 编译后 node 运行（见下方命令）。
import { parseQuantity, subtractFraction, unitsMatch, formatQuantity } from '../src/lib/quantity';
import {
  allocateCompletedUsage, makeLossRecord, recomputeQuantityAfterLosses,
} from '../src/lib/pantry-allocation';
import type { PantryItem, Recipe, RecipeItem, LossReason } from '../src/types';

let pass = 0;
let fail = 0;
function assert(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ok  - ${name}`); }
  else { fail++; console.log(`  FAIL- ${name}${extra ? ' :: ' + extra : ''}`); }
}

// 复刻 pantryDisplayMap 的核心：当前库存 = originalQuantity − 损耗 − FIFO扣减
// 关键点：必须传入【全部食材】一起分摊（真实代码就是这样），单独传一个批次会误判不够了。
function displayStock(items: PantryItem[], targetId: string, recipeItems: RecipeItem[], recipes: Recipe[]): string {
  const alloc = allocateCompletedUsage(items, recipeItems, recipes);
  const item = items.find(i => i.id === targetId)!;
  const base = parseQuantity(item.originalQuantity || item.quantity)!;
  let num = base.numerator;
  let den = base.denominator;
  let useFraction = base.isFraction || base.isHalf;
  for (const l of item.losses || []) {
    const lp = parseQuantity(l.quantity);
    if (!lp || !unitsMatch(lp.unit, base.unit)) continue;
    const r = subtractFraction(num, den, lp.numerator, lp.denominator);
    num = r.num; den = r.den;
    useFraction = useFraction || lp.isFraction || lp.isHalf;
  }
  const d = alloc.deductions.get(item.id);
  if (d) {
    const r = subtractFraction(num, den, d.num, d.den);
    num = r.num; den = r.den;
  }
  const insufficient = alloc.insufficientIds.has(item.id);
  if (num <= 0) return `剩0${base.unit}` + (insufficient ? ' [不够了]' : '');
  return `剩${formatQuantity(num, den, useFraction)}${base.unit}` + (insufficient ? ' [不够了]' : '');
}

console.log('=== Bug1: 茄子损耗登记不应变 0 ===');
{
  // 场景：茄子采购 180g，无已完成菜谱（用户嘴里"正确库存 180"）
  const eggplant: PantryItem = {
    id: 'egg', userId: 'u', name: '茄子', quantity: '180g', originalQuantity: '180g',
    status: 'active', category: 'vegetable', createdAt: '2026-08-20T00:00:00Z', losses: [],
  };
  assert('损耗前显示 180g', displayStock([eggplant], 'egg', [], []) === '剩180g', displayStock([eggplant], 'egg', [], []));

  // 登记损耗 60g（损耗模式）
  const loss = makeLossRecord('L1', '60g', eggplant.originalQuantity || eggplant.quantity, 'spoiled' as LossReason);
  const afterLoss: PantryItem = {
    ...eggplant,
    losses: [loss],
    quantity: recomputeQuantityAfterLosses({ ...eggplant, losses: [loss] }),
  };
  assert('损耗 60g 后 originalQuantity 仍=180g（不可变）', afterLoss.originalQuantity === '180g', afterLoss.originalQuantity);
  assert('损耗 60g 后库存=120g（不再变 0）', displayStock([afterLoss], 'egg', [], []) === '剩120g', displayStock([afterLoss], 'egg', [], []));
  assert('损耗记录为 -60g', afterLoss.losses![0].quantity === '60g', afterLoss.losses![0].quantity);

  // 删除这条损耗（removePantryLoss 语义）
  const afterDelete: PantryItem = {
    ...afterLoss,
    losses: [],
    quantity: recomputeQuantityAfterLosses({ ...afterLoss, losses: [] }),
  };
  assert('删除损耗后库存恢复 180g', displayStock([afterDelete], 'egg', [], []) === '剩180g', displayStock([afterDelete], 'egg', [], []));
  assert('删除损耗后 originalQuantity 仍=180g', afterDelete.originalQuantity === '180g');

  // 损耗量缺单位时借用基准单位（如基准 500g、录入 "100" → 100g）
  const loss2 = makeLossRecord('L2', '100', '500g', 'spoiled' as LossReason);
  assert('损耗量缺单位借用基准单位', loss2.quantity === '100g', loss2.quantity);
}

console.log('=== Bug1 边界：茄子有已完成菜谱用量时，损耗也不该额外变 0 ===');
{
  // 茄子采购 790g，已完成菜谱用了 150g（completedAt 在采购之后）。用户想再损耗 60g。
  const eggplant: PantryItem = {
    id: 'egg2', userId: 'u', name: '茄子', quantity: '790g', originalQuantity: '790g',
    status: 'active', category: 'vegetable', createdAt: '2026-08-20T00:00:00Z', losses: [],
  };
  const recipe: Recipe = { id: 'r1', userId: 'u', title: '辣味沙拉', active: false, completedAt: '2026-08-21T00:00:00Z', createdAt: '2026-08-19T00:00:00Z' } as Recipe;
  const ri: RecipeItem = { id: 'ri1', recipeId: 'r1', name: '茄子', quantity: '150g' };
  assert('损耗前 790−150=剩640g', displayStock([eggplant], 'egg2', [ri], [recipe]) === '剩640g', displayStock([eggplant], 'egg2', [ri], [recipe]));

  const loss = makeLossRecord('L1', '60g', eggplant.originalQuantity!, 'spoiled' as LossReason);
  const afterLoss: PantryItem = { ...eggplant, losses: [loss], quantity: recomputeQuantityAfterLosses({ ...eggplant, losses: [loss] }) };
  // 正确结果 = 790 − 60(损耗) − 150(已完成) = 580g，不应变成 0
  assert('损耗 60g 后 = 剩580g（FIFO 只扣一次）', displayStock([afterLoss], 'egg2', [ri], [recipe]) === '剩580g', displayStock([afterLoss], 'egg2', [ri], [recipe]));
}

console.log('=== Bug2: 柠檬老+新两批次，菜谱要 2个，不应标不够了 ===');
{
  const tOld = '2026-08-10T00:00:00Z';
  const tNew = '2026-08-25T00:00:00Z';
  const tDone = '2026-08-22T00:00:00Z'; // 菜谱完成时间：夹在老/新柠檬之间

  const oldLemon: PantryItem = { id: 'lemOld', userId: 'u', name: '柠檬', quantity: '1个', originalQuantity: '1个', status: 'active', category: 'other', createdAt: tOld, losses: [] };
  const newLemon: PantryItem = { id: 'lemNew', userId: 'u', name: '柠檬', quantity: '1个', originalQuantity: '1个', status: 'active', category: 'other', createdAt: tNew, losses: [] };
  const recipe: Recipe = { id: 'rL', userId: 'u', title: '柠檬鸡', active: false, completedAt: tDone, createdAt: '2026-08-09T00:00:00Z' } as Recipe;
  const ri: RecipeItem = { id: 'riL', recipeId: 'rL', name: '柠檬', quantity: '2个' };

  const allLemons = [oldLemon, newLemon];
  const oldDisp = displayStock(allLemons, 'lemOld', [ri], [recipe]);
  const newDisp = displayStock(allLemons, 'lemNew', [ri], [recipe]);
  console.log(`    老柠檬: ${oldDisp} | 新柠檬: ${newDisp}`);
  assert('老柠檬不被标「不够了」', !oldDisp.includes('不够了'), oldDisp);
  assert('新柠檬不被标「不够了」', !newDisp.includes('不够了'), newDisp);
  assert('两批次合计被菜谱消耗完（老剩0 且 新剩0）', oldDisp === '剩0个' && newDisp === '剩0个', `${oldDisp} / ${newDisp}`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
