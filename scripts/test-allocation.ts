// FIFO 分摊逻辑测试：模拟用户上报的柠檬 bug 场景及边界情况
// 运行：npx esbuild scripts/test-allocation.ts --bundle --format=esm --outfile=/tmp/test-allocation.mjs && node /tmp/test-allocation.mjs
import { allocateCompletedUsage, canonicalName } from '../src/lib/pantry-allocation';
import { parseQuantity, subtractFraction, formatQuantity } from '../src/lib/quantity';
import type { PantryItem, Recipe, RecipeItem } from '../src/types';

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}: 期望 ${e}，实际 ${a}`);
  }
}

function pantry(id: string, name: string, quantity: string, createdAt: string, status: 'active' | 'checked' = 'active'): PantryItem {
  return { id, userId: 'u1', name, quantity, status, category: 'other', createdAt, originalQuantity: quantity };
}
function recipe(id: string, createdAt: string, active: boolean, completedAt?: string): Recipe {
  return { id, userId: 'u1', title: `菜谱${id}`, createdAt, active, completedAt };
}
function ri(id: string, recipeId: string, name: string, quantity: string): RecipeItem {
  return { id, recipeId, name, quantity };
}

// 计算某食材批次扣减后的剩余量（与 hook 中 displayMap 的算法一致）
function remaining(item: PantryItem, alloc: Map<string, { num: number; den: number }>): string {
  const op = parseQuantity(item.originalQuantity || item.quantity)!;
  const d = alloc.get(item.id);
  if (!d) return `${formatQuantity(op.numerator, op.denominator, op.isFraction || op.isHalf)}${op.unit}`;
  const r = subtractFraction(op.numerator, op.denominator, d.num, d.den);
  return `剩${formatQuantity(Math.max(0, r.num), r.den, op.isFraction || op.isHalf)}${op.unit}`;
}

// ===== 场景 1：用户上报的 bug =====
// 旧柠檬 2个(Day1) → 菜谱用了 1个并于 Day3 完成 → 又买新柠檬 2个(Day5)
console.log('\n场景1：柠檬 bug（旧柠檬没用完时又买了新的）');
{
  const pantryItems = [
    pantry('lemon1', '柠檬', '2个', '2026-08-01T00:00:00Z'),
    pantry('lemon2', '柠檬', '2个', '2026-08-05T00:00:00Z'),
  ];
  const recipes = [recipe('r1', '2026-08-02T00:00:00Z', false, '2026-08-03T00:00:00Z')];
  const recipeItems = [ri('ri1', 'r1', '柠檬', '1个')];
  const { deductions, insufficientIds } = allocateCompletedUsage(pantryItems, recipeItems, recipes);
  check('旧柠檬剩1个（承担历史菜谱扣减）', remaining(pantryItems[0], deductions), '剩1个');
  check('新柠檬显示原始量2个（无扣减、不被历史菜谱误扣）', remaining(pantryItems[1], deductions), '2个');
  check('无"不够了"标记', insufficientIds.size, 0);
}

// ===== 场景 2：用户"两个都是0"的完整复现 =====
// 旧柠檬 2个(Day1)，菜谱1(Day3完成)用1个，新柠檬 1个(Day5)，菜谱2(Day6完成)用1个
// 旧代码：旧柠檬 2-1-1=0，新柠檬 1-1-1=-1→0，两个都是 0
console.log('\n场景2："两个都是0"复现');
{
  const pantryItems = [
    pantry('lemon1', '柠檬', '2个', '2026-08-01T00:00:00Z'),
    pantry('lemon2', '柠檬', '1个', '2026-08-05T00:00:00Z'),
  ];
  const recipes = [
    recipe('r1', '2026-08-02T00:00:00Z', false, '2026-08-03T00:00:00Z'),
    recipe('r2', '2026-08-05T12:00:00Z', false, '2026-08-06T00:00:00Z'),
  ];
  const recipeItems = [ri('ri1', 'r1', '柠檬', '1个'), ri('ri2', 'r2', '柠檬', '1个')];
  const { deductions } = allocateCompletedUsage(pantryItems, recipeItems, recipes);
  // 菜谱1(Day3)只有旧柠檬存在 → 扣旧柠檬；菜谱2(Day6)时旧柠檬池剩1，FIFO 先扣旧柠檬
  check('旧柠檬剩0个（共扣2个）', remaining(pantryItems[0], deductions), '剩0个');
  check('新柠檬显示原始量1个（不被菜谱1误扣）', remaining(pantryItems[1], deductions), '1个');
}

// ===== 场景 3：FIFO 跨批次分摊 =====
console.log('\n场景3：FIFO 跨批次（用量超过第一批）');
{
  const pantryItems = [
    pantry('a1', '土豆', '2个', '2026-08-01T00:00:00Z'),
    pantry('a2', '土豆', '3个', '2026-08-02T00:00:00Z'),
  ];
  const recipes = [recipe('r1', '2026-08-02T00:00:00Z', false, '2026-08-03T00:00:00Z')];
  const recipeItems = [ri('ri1', 'r1', '土豆', '3个')];
  const { deductions, allocatedRecipeItemIds } = allocateCompletedUsage(pantryItems, recipeItems, recipes);
  check('第一批扣完2个（剩0）', remaining(pantryItems[0], deductions), '剩0个');
  check('第二批扣1个（剩2）', remaining(pantryItems[1], deductions), '剩2个');
  check('两个批次都记录该菜谱用量', allocatedRecipeItemIds.get('a1')?.has('ri1') && allocatedRecipeItemIds.get('a2')?.has('ri1'), true);
}

// ===== 场景 4：已用完(checked)批次不再承担扣减，扣减落到现有(active)批次 =====
// 修复 bug：旧逻辑让隐藏的 checked 批次吸收扣减，导致用户看到的现有批次数量不变（"没同步"）
// 注意：现有批次购买时间须早于菜谱完成时间，才会被 FIFO 判定为"可承担该次扣减"的批次
console.log('\n场景4：旧批次已勾选"已用完"（应扣现有批次）');
{
  const pantryItems = [
    pantry('c1', '柠檬', '2个', '2026-08-01T00:00:00Z', 'checked'),
    pantry('c2', '柠檬', '2个', '2026-08-02T00:00:00Z'),
  ];
  const recipes = [recipe('r1', '2026-08-02T00:00:00Z', false, '2026-08-03T00:00:00Z')];
  const recipeItems = [ri('ri1', 'r1', '柠檬', '2个')];
  const { deductions, allocatedRecipeItemIds } = allocateCompletedUsage(pantryItems, recipeItems, recipes);
  check('已用完批次不承担扣减', deductions.has('c1'), false);
  check('扣减由现有批次承担', deductions.get('c2'), { num: 2, den: 1 });
  check('现有批次显示该菜谱记录', allocatedRecipeItemIds.get('c2')?.has('ri1'), true);
}

// ===== 场景 4b：同名多批次，最旧的现有(active)批次优先被扣（FIFO），现存批次均可见 =====
console.log('\n场景4b：两个现有批次，FIFO 扣最旧的（修复"没同步"观感）');
{
  const pantryItems = [
    pantry('a1', '羽衣甘蓝', '100g', '2026-08-20T00:00:00Z'),
    pantry('a2', '羽衣甘蓝', '200g', '2026-08-25T00:00:00Z'),
  ];
  const recipes = [recipe('r1', '2026-08-26T00:00:00Z', false, '2026-08-27T16:00:00Z')];
  const recipeItems = [ri('ri1', 'r1', '羽衣甘蓝', '30g')];
  const { deductions } = allocateCompletedUsage(pantryItems, recipeItems, recipes);
  check('最旧现有批次承担30g扣减', deductions.get('a1'), { num: 30, den: 1 });
  check('较新现有批次无扣减(仍200g)', remaining(pantryItems[1], deductions), '200g');
  check('最旧批次显示剩70g', remaining(pantryItems[0], deductions), '剩70g');
}

// ===== 场景 5：用量超过全部库存 → 旧柠檬标记"不够了" =====
console.log('\n场景5：用量超过库存（insufficient）');
{
  const pantryItems = [pantry('d1', '柠檬', '1个', '2026-08-01T00:00:00Z')];
  const recipes = [recipe('r1', '2026-08-02T00:00:00Z', false, '2026-08-03T00:00:00Z')];
  const recipeItems = [ri('ri1', 'r1', '柠檬', '2个')];
  const { deductions, insufficientIds } = allocateCompletedUsage(pantryItems, recipeItems, recipes);
  check('扣减上限为库存量1个', deductions.get('d1'), { num: 1, den: 1 });
  check('标记"不够了"', insufficientIds.has('d1'), true);
}

// ===== 场景 6：单位不一致不扣减 =====
console.log('\n场景6：单位不一致（g vs 个）');
{
  const pantryItems = [pantry('e1', '牛肉', '200g', '2026-08-01T00:00:00Z')];
  const recipes = [recipe('r1', '2026-08-02T00:00:00Z', false, '2026-08-03T00:00:00Z')];
  const recipeItems = [ri('ri1', 'r1', '牛肉', '1块')];
  const { deductions } = allocateCompletedUsage(pantryItems, recipeItems, recipes);
  check('单位不匹配不扣减', deductions.size, 0);
}

// ===== 场景 7：g 与 克 互通 + 分数 =====
console.log('\n场景7：g/克 互通与分数用量');
{
  const pantryItems = [pantry('f1', '面粉', '500克', '2026-08-01T00:00:00Z')];
  const recipes = [recipe('r1', '2026-08-02T00:00:00Z', false, '2026-08-03T00:00:00Z')];
  const recipeItems = [ri('ri1', 'r1', '面粉', '1/2g')];
  const { deductions } = allocateCompletedUsage(pantryItems, recipeItems, recipes);
  check('克与1/2g互通扣减', deductions.get('f1'), { num: 1, den: 2 });
}

// ===== 场景 8：同义词归一化（番茄/西红柿） =====
console.log('\n场景8：同义词（菜谱写西红柿，库存是番茄）');
{
  const pantryItems = [
    pantry('g1', '番茄', '2个', '2026-08-01T00:00:00Z'),
    pantry('g2', '番茄', '2个', '2026-08-05T00:00:00Z'),
  ];
  const recipes = [recipe('r1', '2026-08-02T00:00:00Z', false, '2026-08-03T00:00:00Z')];
  const recipeItems = [ri('ri1', 'r1', '西红柿', '1个')];
  const { deductions } = allocateCompletedUsage(pantryItems, recipeItems, recipes);
  check('西红柿扣到旧批次番茄', deductions.get('g1'), { num: 1, den: 1 });
  check('新批次番茄不受影响', deductions.has('g2'), false);
  check('canonicalName 归一化', [canonicalName('西红柿'), canonicalName('番茄')], ['番茄', '番茄']);
}

// ===== 场景 9：删除旧批次后新批次不被历史菜谱扣 =====
console.log('\n场景9：旧批次已删除，只剩新批次');
{
  const pantryItems = [pantry('h1', '柠檬', '3个', '2026-08-10T00:00:00Z')];
  const recipes = [recipe('r1', '2026-08-02T00:00:00Z', false, '2026-08-03T00:00:00Z')];
  const recipeItems = [ri('ri1', 'r1', '柠檬', '2个')];
  const { deductions } = allocateCompletedUsage(pantryItems, recipeItems, recipes);
  check('新批次创建晚于菜谱完成 → 不扣减', deductions.size, 0);
}

// ===== 场景 10：单个批次正常扣减（回归测试） =====
console.log('\n场景10：单批次正常扣减（无回归）');
{
  const pantryItems = [pantry('i1', '牛嫩肉', '120g', '2026-08-01T00:00:00Z')];
  const recipes = [recipe('r1', '2026-08-02T00:00:00Z', false, '2026-08-03T00:00:00Z')];
  const recipeItems = [ri('ri1', 'r1', '牛嫩肉', '50g')];
  const { deductions, insufficientIds } = allocateCompletedUsage(pantryItems, recipeItems, recipes);
  check('正常扣减50g', deductions.get('i1'), { num: 50, den: 1 });
  check('剩70g', remaining(pantryItems[0], deductions), '剩70g');
  check('无不够标记', insufficientIds.size, 0);
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) throw new Error(`${failed} 个测试失败`);
