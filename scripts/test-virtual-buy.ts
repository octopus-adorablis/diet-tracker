import {
  buildVirtualToBuyItems,
  allocateCompletedUsage,
  canonicalName,
} from '../src/lib/pantry-allocation';
import type { PantryItem, Recipe, RecipeItem, PantryCategory } from '../src/types';

// 测试用：简单的分类占位（不影响待买数量断言）
const cat = (_name: string): PantryCategory => 'other';

function mkPantry(id: string, name: string, quantity: string, status: PantryItem['status']): PantryItem {
  return { id, userId: 'u', name, quantity, status, category: 'other', createdAt: '' };
}
function mkRecipe(id: string, active = true): Recipe {
  return { id, userId: 'u', title: id, createdAt: '', active };
}
function mkRecipeItem(id: string, recipeId: string, name: string, quantity: string): RecipeItem {
  return { id, recipeId, name, quantity };
}

let passed = 0, failed = 0;
function check(label: string, cond: boolean, extra = '') {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label} ${extra}`); }
}

// ===== 场景 1：茄子用量为定性（适量），食材库无 → 应生成待购买「适量」 =====
{
  const recipes = [mkRecipe('r1')];
  const items: RecipeItem[] = [mkRecipeItem('i1', 'r1', '茄子', '适量')];
  const pantry: PantryItem[] = [];
  const alloc = allocateCompletedUsage(pantry, items, recipes);
  const v = buildVirtualToBuyItems(pantry, items, recipes, alloc, cat, 'u');
  check('茄子「适量」生成待购买项', v.length === 1);
  check('待购买数量为「适量」', v[0]?.quantity === '适量', `实际=${v[0]?.quantity}`);
  check('待购买 id 前缀 virtual-', v[0]?.id.startsWith('virtual-茄子'));
}

// ===== 场景 2：茄子用量为数值（2根），食材库无 → 生成「2根」（回归） =====
{
  const recipes = [mkRecipe('r1')];
  const items: RecipeItem[] = [mkRecipeItem('i1', 'r1', '茄子', '2根')];
  const pantry: PantryItem[] = [];
  const alloc = allocateCompletedUsage(pantry, items, recipes);
  const v = buildVirtualToBuyItems(pantry, items, recipes, alloc, cat, 'u');
  check('茄子「2根」生成待购买项', v.length === 1);
  check('待购买数量为「2根」', v[0]?.quantity === '2根', `实际=${v[0]?.quantity}`);
}

// ===== 场景 3：茄子数量留空，食材库无 → 生成待购买「适量」 =====
{
  const recipes = [mkRecipe('r1')];
  const items: RecipeItem[] = [mkRecipeItem('i1', 'r1', '茄子', '')];
  const pantry: PantryItem[] = [];
  const alloc = allocateCompletedUsage(pantry, items, recipes);
  const v = buildVirtualToBuyItems(pantry, items, recipes, alloc, cat, 'u');
  check('茄子留空生成待购买项', v.length === 1);
  check('待购买数量为「适量」', v[0]?.quantity === '适量', `实际=${v[0]?.quantity}`);
}

// ===== 场景 4：茄子「适量」，但食材库已有茄子 → 不提示购买 =====
{
  const recipes = [mkRecipe('r1')];
  const items: RecipeItem[] = [mkRecipeItem('i1', 'r1', '茄子', '适量')];
  const pantry: PantryItem[] = [mkPantry('p1', '茄子', '3根', 'active')];
  const alloc = allocateCompletedUsage(pantry, items, recipes);
  const v = buildVirtualToBuyItems(pantry, items, recipes, alloc, cat, 'u');
  check('已有茄子则不重复提示购买', v.length === 0, `实际长度=${v.length}`);
}

// ===== 场景 5：茄子「2根」，食材库仅有 1根 → 生成缺量「1根」 =====
{
  const recipes = [mkRecipe('r1')];
  const items: RecipeItem[] = [mkRecipeItem('i1', 'r1', '茄子', '2根')];
  const pantry: PantryItem[] = [mkPantry('p1', '茄子', '1根', 'active')];
  const alloc = allocateCompletedUsage(pantry, items, recipes);
  const v = buildVirtualToBuyItems(pantry, items, recipes, alloc, cat, 'u');
  check('茄子缺 1根 生成 shortfall 待购买', v.length === 1);
  check('shortfall 数量为「1根」', v[0]?.quantity === '1根', `实际=${v[0]?.quantity}`);
  check('shortfall id 前缀 virtual-shortfall-', v[0]?.id.startsWith('virtual-shortfall-茄子'));
}

// ===== 场景 6：同义词——食材库有「西红柿3」，菜谱要「番茄1」→ 不提示购买 =====
{
  const recipes = [mkRecipe('r1')];
  const items: RecipeItem[] = [mkRecipeItem('i1', 'r1', '番茄', '1')];
  const pantry: PantryItem[] = [mkPantry('p1', '西红柿', '3', 'active')];
  const alloc = allocateCompletedUsage(pantry, items, recipes);
  const v = buildVirtualToBuyItems(pantry, items, recipes, alloc, cat, 'u');
  check('番茄/西红柿 同义词已覆盖（不提示购买）', v.length === 0, `实际长度=${v.length}`);
  check('canonicalName(西红柿)=番茄', canonicalName('西红柿') === '番茄');
}

// ===== 场景 7：已关闭菜谱不提示购买 =====
{
  const recipes = [mkRecipe('r1', false)];
  const items: RecipeItem[] = [mkRecipeItem('i1', 'r1', '茄子', '2根')];
  const pantry: PantryItem[] = [];
  const alloc = allocateCompletedUsage(pantry, items, recipes);
  const v = buildVirtualToBuyItems(pantry, items, recipes, alloc, cat, 'u');
  check('已关闭菜谱不生成待购买', v.length === 0, `实际长度=${v.length}`);
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);
