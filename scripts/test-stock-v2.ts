// 复现用户报告的"大面积库存归零"回归场景，验证新模型（quantity 为唯一库存真相）修复正确。
// 关键：已完成菜谱的 FIFO 只扣"菜谱完成前已存在的批次"，不扣之后买入的新批次。
import type { PantryItem, Recipe, RecipeItem } from '../src/types';
import { allocateCompletedUsage, subtractLossFromStock, addLossToStock } from '../src/lib/pantry-allocation';
import { parseQuantity, formatQuantity, subtractFraction } from '../src/lib/quantity';

let pass = 0, fail = 0;
function assert(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
}

const T0 = '2026-01-01T00:00:00Z'; // 很早买入
const T1 = '2026-08-01T00:00:00Z'; // 某菜谱完成时间
const T2 = '2026-08-20T00:00:00Z'; // 菜谱完成后才买入（新批次）

// ===== 场景：多个食材在菜谱完成后买入（应为"新批次"，不被旧菜谱扣减） =====
function mk(id: string, name: string, qty: string, createdAt: string, losses: PantryItem['losses'] = []): PantryItem {
  return {
    id, userId: 'u', name, quantity: qty, status: 'active', category: 'vegetable',
    createdAt, originalQuantity: qty, losses,
  } as PantryItem;
}

const pantry: PantryItem[] = [
  mk('eggplant', '茄子', '180g', T2),        // 菜谱完成后买入 → 新批次
  mk('cucumber', '黄瓜', '200g', T2),
  mk('pepper', '青椒', '150g', T2),
  mk('tomato', '番茄', '300g', T2),
  mk('scallion', '葱白', '50g', T2),
  mk('kale', '羽衣甘蓝', '100g', T0),        // 菜谱完成前买入 → 老批次
  mk('lemon-old', '柠檬', '1个', T0),        // 老批次
  mk('lemon-new', '柠檬', '1个', T2),        // 新批次
];

// 已完成菜谱（完成于 T1），使用了上述食材
const recipe: Recipe = { id: 'r1', userId: 'u', title: '历史菜谱', active: false, completedAt: T1, createdAt: T0, sortOrder: 0 } as Recipe;
const recipeItems: RecipeItem[] = [
  { id: 'ri1', recipeId: 'r1', name: '茄子', quantity: '150g' },
  { id: 'ri2', recipeId: 'r1', name: '黄瓜', quantity: '100g' },
  { id: 'ri3', recipeId: 'r1', name: '青椒', quantity: '80g' },
  { id: 'ri4', recipeId: 'r1', name: '番茄', quantity: '120g' },
  { id: 'ri5', recipeId: 'r1', name: '葱白', quantity: '30g' },
  { id: 'ri6', recipeId: 'r1', name: '羽衣甘蓝', quantity: '93g' },
  { id: 'ri7', recipeId: 'r1', name: '柠檬', quantity: '2个' },
];

const alloc = allocateCompletedUsage(pantry, recipeItems, [recipe]);

function displayStock(item: PantryItem): string {
  const base = parseQuantity(item.quantity)!;
  let num = base.numerator, den = base.denominator;
  const useFraction = base.isFraction || base.isHalf;
  const d = alloc.deductions.get(item.id);
  if (d) { const r = subtractFraction(num, den, d.num, d.den); num = r.num; den = r.den; }
  if (num <= 0) return `剩0${base.unit}` + (alloc.insufficientIds.has(item.id) ? ' [不够了]' : '');
  return `剩${formatQuantity(num, den, useFraction)}${base.unit}` + (alloc.insufficientIds.has(item.id) ? ' [不够了]' : '');
}

console.log('— 回归场景：菜谱完成后买入的食材不应被归零 —');
assert('茄子 180g（新批次，不扣）→ 180g', displayStock(pantry[0]) === '剩180g', displayStock(pantry[0]));
assert('黄瓜 200g（新批次，不扣）→ 200g', displayStock(pantry[1]) === '剩200g', displayStock(pantry[1]));
assert('青椒 150g（新批次，不扣）→ 150g', displayStock(pantry[2]) === '剩150g', displayStock(pantry[2]));
assert('番茄 300g（新批次，不扣）→ 300g', displayStock(pantry[3]) === '剩300g', displayStock(pantry[3]));
assert('葱白 50g（新批次，不扣）→ 50g', displayStock(pantry[4]) === '剩50g', displayStock(pantry[4]));

console.log('— 老批次（菜谱完成前买入）正常扣减 —');
assert('羽衣甘蓝 100g − 93g = 7g（老批次，正确扣）', displayStock(pantry[5]) === '剩7g', displayStock(pantry[5]));

console.log('— 柠檬：老批次扛 2个 不够，新批次保护不被误扣 —');
assert('老柠檬 1个 → 剩0 [不够了]', displayStock(pantry[6]).startsWith('剩0个') && alloc.insufficientIds.has('lemon-old'), displayStock(pantry[6]));
assert('新柠檬 1个 → 剩1个（不被旧菜谱扣）', displayStock(pantry[7]) === '剩1个', displayStock(pantry[7]));

console.log('— 损耗加减库存（基于 quantity，不依赖 originalQuantity） —');
assert('记录损耗 180g − 60g = 120g', subtractLossFromStock('180g', '60g') === '120g', subtractLossFromStock('180g', '60g'));
assert('删除损耗 120g + 60g = 180g（恢复）', addLossToStock('120g', '60g') === '180g', addLossToStock('120g', '60g'));
assert('单位不一致不串减（2个 − 60g = 2个）', subtractLossFromStock('2个', '60g') === '2个', subtractLossFromStock('2个', '60g'));
assert('损耗后新批次也不归零：180-60=120', subtractLossFromStock('180g', '60g') === '120g');

console.log('— 损耗叠加 FIFO 显示正确（茄子新批次有损耗 60g） —');
const eggplantWithLoss = mk('eggplant', '茄子', subtractLossFromStock('180g', '60g'), T2, [{ id: 'L1', quantity: '60g', reason: 'spoiled', createdAt: T2 }]);
assert('茄子 180→损耗60=120g（新批次 FIFO 不扣）→ 120g', displayStock(eggplantWithLoss) === '剩120g', displayStock(eggplantWithLoss));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
