import { collectActiveNeededUsages } from '../src/lib/pantry-allocation';
import type { PantryItem, Recipe, RecipeItem } from '../src/types';

declare const process: { exit(code: number): void };

function makeItem(qty: string): PantryItem {
  return {
    id: 'eggplant-1',
    userId: 'u1',
    name: '茄子',
    quantity: qty,
    status: 'active',
    category: 'vegetable',
    createdAt: '2026-08-20T00:00:00Z',
    originalQuantity: qty,
  };
}

function makeRecipe(id: string, title: string, active = true): Recipe {
  return {
    id,
    userId: 'u1',
    title,
    active: active ? true : false,
    createdAt: '2026-08-20T00:00:00Z',
    completedAt: active ? undefined : '2026-08-21T00:00:00Z',
  };
}

function makeRI(id: string, recipeId: string, name: string, qty: string): RecipeItem {
  return { id, recipeId, name, quantity: qty };
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.error(`❌ ${name}`); }
}

// 场景 1：用户真实场景 — 茄子 380g，三个活跃菜谱各需 170g、120g、100g
{
  const item = makeItem('380g');
  const recipes = [
    makeRecipe('r-thai', '泰式茄辣西拌粉丝（拍摄）'),
    makeRecipe('r-salad', '辣味沙拉'),
    makeRecipe('r-butter', '黄油拌饭'),
  ];
  const ris = [
    makeRI('ri-1', 'r-thai', '茄子', '170g'),
    makeRI('ri-2', 'r-salad', '茄子', '120g'),
    makeRI('ri-3', 'r-butter', '茄子', '100g'),
  ];
  const { usages, insufficient } = collectActiveNeededUsages(item, ris, recipes, { numerator: 380, denominator: 1, unit: 'g', isFraction: false, isHalf: false, number: 380 });
  check('三个活跃菜谱都应显示为「需用」', usages.length === 3);
  check('包含黄油拌饭', usages.some(u => u.recipeTitle === '黄油拌饭'));
  check('包含泰式菜谱', usages.some(u => u.recipeTitle === '泰式茄辣西拌粉丝（拍摄）'));
  check('包含辣味沙拉', usages.some(u => u.recipeTitle === '辣味沙拉'));
  check('总需求 390g > 库存 380g，应标记 insufficient', insufficient === true);
}

// 场景 2：总需求刚好等于库存
{
  const item = makeItem('200g');
  const recipes = [makeRecipe('r-a', '菜A'), makeRecipe('r-b', '菜B')];
  const ris = [makeRI('ri-a', 'r-a', '茄子', '100g'), makeRI('ri-b', 'r-b', '茄子', '100g')];
  const { usages, insufficient } = collectActiveNeededUsages(item, ris, recipes, { numerator: 200, denominator: 1, unit: 'g', isFraction: false, isHalf: false, number: 200 });
  check('刚好够用：两个需求都显示', usages.length === 2);
  check('刚好够用：不标记 insufficient', insufficient === false);
}

// 场景 3：已完成菜谱不参与「需用」
{
  const item = makeItem('300g');
  const recipes = [makeRecipe('r-done', '已完成的菜', false), makeRecipe('r-active', '活跃的菜')];
  const ris = [makeRI('ri-done', 'r-done', '茄子', '100g'), makeRI('ri-active', 'r-active', '茄子', '50g')];
  const { usages, insufficient } = collectActiveNeededUsages(item, ris, recipes, { numerator: 300, denominator: 1, unit: 'g', isFraction: false, isHalf: false, number: 300 });
  check('已完成菜谱不显示在「需用」', usages.length === 1);
  check('只显示活跃菜谱', usages[0]?.recipeTitle === '活跃的菜');
  check('活跃需求足够，不 insufficient', insufficient === false);
}

// 场景 4：单位不一致仍显示需求
{
  const item = makeItem('2根');
  const recipes = [makeRecipe('r-count', '按根数的菜'), makeRecipe('r-g', '按克的菜')];
  const ris = [makeRI('ri-count', 'r-count', '茄子', '1根'), makeRI('ri-g', 'r-g', '茄子', '100g')];
  const { usages } = collectActiveNeededUsages(item, ris, recipes, { numerator: 2, denominator: 1, unit: '根', isFraction: false, isHalf: false, number: 2 });
  check('单位不一致也显示为「需用」', usages.length === 2);
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
