// 仿真测试：用真实的 allocateCompletedUsage 复现"柠檬误标不够了"与"青椒库存对不上"
// 并作为回归守卫：移除时间过滤后，新批次不应被误扣成 0。
import { allocateCompletedUsage, canonicalName } from '../src/lib/pantry-allocation';
import { parseQuantity, subtractFraction } from '../src/lib/quantity';
import type { PantryItem, Recipe, RecipeItem } from '../src/types';

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}  ${detail}`); }
}

// 计算某食材"显示剩余量"（镜像 hook 的 pantryDisplayMap 核心：originalQty - FIFO扣减）
function remainingOf(item: PantryItem, alloc: ReturnType<typeof allocateCompletedUsage>): string {
  const base = parseQuantity(item.originalQuantity || item.quantity)!;
  let num = base.numerator;
  let den = base.denominator;
  const d = alloc.deductions.get(item.id);
  if (d) {
    const r = subtractFraction(num, den, d.num, d.den);
    num = r.num; den = r.den;
  }
  const unit = base.unit;
  if (num <= 0) return `剩0${unit}`;
  return `剩${num / den}${unit}`;
}
const insufficientOf = (item: PantryItem, alloc: ReturnType<typeof allocateCompletedUsage>) =>
  alloc.insufficientIds.has(item.id);

// ============ 场景1：柠檬（两批次 + 已完成菜谱需2个）→ 误标不够了 ============
console.log('\n[场景1] 柠檬：老柠檬1个 + 新柠檬1个，已完成菜谱需2个');
{
  const oldLemon: PantryItem = { id: 'L1', name: '柠檬', quantity: '1个', status: 'active', createdAt: '2026-08-01T00:00:00', originalQuantity: '1个' } as PantryItem;
  const newLemon: PantryItem = { id: 'L2', name: '柠檬', quantity: '1个', status: 'active', createdAt: '2026-08-20T00:00:00', originalQuantity: '1个' } as PantryItem;
  const recipe: Recipe = { id: 'R1', title: '柠檬菜', active: false, completedAt: '2026-08-15T00:00:00' } as Recipe;
  const ri: RecipeItem = { id: 'RI1', recipeId: 'R1', name: '柠檬', quantity: '2个' } as RecipeItem;

  const alloc = allocateCompletedUsage([oldLemon, newLemon], [ri], [recipe]);
  console.log(`    老柠檬显示: ${remainingOf(oldLemon, alloc)}  不够了=${insufficientOf(oldLemon, alloc)}`);
  console.log(`    新柠檬显示: ${remainingOf(newLemon, alloc)}  不够了=${insufficientOf(newLemon, alloc)}`);

  // 正确预期：两个柠檬各被用掉1个，都剩0，都不该标"不够了"
  assert('老柠檬未被标"不够了"', !insufficientOf(oldLemon, alloc), '实际被误标');
  assert('新柠檬未被标"不够了"', !insufficientOf(newLemon, alloc), '实际被误标');
  assert('老柠檬剩余=0个', remainingOf(oldLemon, alloc) === '剩0个', remainingOf(oldLemon, alloc));
  assert('新柠檬剩余=0个', remainingOf(newLemon, alloc) === '剩0个', remainingOf(newLemon, alloc));
}

// ============ 场景2：青椒（老批次不够、需动用新批次）→ 库存与菜谱对不上 + 误标不够了 ============
console.log('\n[场景2] 青椒：老青椒100g + 新青椒200g（共300g），已完成菜谱用青椒200g');
{
  const oldPepper: PantryItem = { id: 'P1', name: '青椒', quantity: '100g', status: 'active', createdAt: '2026-08-01T00:00:00', originalQuantity: '100g' } as PantryItem;
  const newPepper: PantryItem = { id: 'P2', name: '青椒', quantity: '200g', status: 'active', createdAt: '2026-08-20T00:00:00', originalQuantity: '200g' } as PantryItem;
  const recipe: Recipe = { id: 'R2', title: '青椒炒肉', active: false, completedAt: '2026-08-10T00:00:00' } as Recipe;
  const ri: RecipeItem = { id: 'RI2', recipeId: 'R2', name: '青椒', quantity: '200g' } as RecipeItem;

  const alloc = allocateCompletedUsage([oldPepper, newPepper], [ri], [recipe]);
  console.log(`    老青椒显示: ${remainingOf(oldPepper, alloc)}  不够了=${insufficientOf(oldPepper, alloc)}`);
  console.log(`    新青椒显示: ${remainingOf(newPepper, alloc)}  不够了=${insufficientOf(newPepper, alloc)}`);

  // 正确预期：共300g，菜用200g → 应剩100g；两批按 FIFO 分摊（老100→0，新200→100），都不该标"不够了"
  // 用户感知：我有300g青椒，菜用了200g，应显示共剩100g
  const totalRemaining = (parseQuantity(remainingOf(oldPepper, alloc))!.numerator / parseQuantity(remainingOf(oldPepper, alloc))!.denominator)
    + (parseQuantity(remainingOf(newPepper, alloc))!.numerator / parseQuantity(remainingOf(newPepper, alloc))!.denominator);
  assert('青椒无任何一条被标"不够了"', !insufficientOf(oldPepper, alloc) && !insufficientOf(newPepper, alloc),
    `老=${insufficientOf(oldPepper, alloc)} 新=${insufficientOf(newPepper, alloc)}`);
  assert('青椒总剩余=100g（300-200）', Math.abs(totalRemaining - 100) < 0.001, `实际总剩余=${totalRemaining}g`);
}

// ============ 回归守卫：移除时间过滤后，新批次不应被误扣成0 ============
console.log('\n[回归守卫] 茄子：老500g + 新300g，已完成菜谱用茄子400g（新批次购于菜谱完成后）');
{
  const oldEgg: PantryItem = { id: 'E1', name: '茄子', quantity: '500g', status: 'active', createdAt: '2026-08-01T00:00:00', originalQuantity: '500g' } as PantryItem;
  const newEgg: PantryItem = { id: 'E2', name: '茄子', quantity: '300g', status: 'active', createdAt: '2026-08-20T00:00:00', originalQuantity: '300g' } as PantryItem;
  const recipe: Recipe = { id: 'R3', title: '红烧茄子', active: false, completedAt: '2026-08-10T00:00:00' } as Recipe;
  const ri: RecipeItem = { id: 'RI3', recipeId: 'R3', name: '茄子', quantity: '400g' } as RecipeItem;

  const alloc = allocateCompletedUsage([oldEgg, newEgg], [ri], [recipe]);
  console.log(`    老茄子显示: ${remainingOf(oldEgg, alloc)}`);
  console.log(`    新茄子显示: ${remainingOf(newEgg, alloc)}`);

  // 正确预期：400g 从老批次扣（FIFO先扣旧的）→ 老剩100g，新仍300g；都不归零、都不标不够了
  assert('老茄子剩余=100g', remainingOf(oldEgg, alloc) === '剩100g', remainingOf(oldEgg, alloc));
  assert('新茄子剩余=300g（未被误扣）', remainingOf(newEgg, alloc) === '剩300g', remainingOf(newEgg, alloc));
  assert('茄子无一条被标"不够了"', !insufficientOf(oldEgg, alloc) && !insufficientOf(newEgg, alloc));
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
