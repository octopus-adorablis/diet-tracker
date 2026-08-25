import { canonicalName, allocateCompletedUsage } from '../src/lib/pantry-allocation';
import { parseQuantity, unitsMatch, addFraction, subtractFraction } from '../src/lib/quantity';
import type { PantryItem, Recipe, RecipeItem } from '../src/types';

let passed = 0;
let failed = 0;
function check(desc: string, cond: boolean) {
  if (cond) { passed++; console.log('  ✓', desc); }
  else { failed++; console.log('  ✗', desc); }
}

const pantry = (name: string, quantity: string, status: PantryItem['status'] = 'active'): PantryItem => ({
  id: 'p-' + name, userId: 'u', name, quantity, status, category: 'vegetable',
  createdAt: '2026-01-01T00:00:00.000Z', originalQuantity: quantity,
});
const recipe = (id: string, active: boolean): Recipe => ({
  id, userId: 'u', title: 'R' + id, createdAt: '', active,
  completedAt: active ? undefined : '2026-01-02T00:00:00.000Z',
});
const ri = (recipeId: string, name: string, quantity: string): RecipeItem => ({
  id: 'ri-' + recipeId + '-' + name, recipeId, name, quantity,
});

// ===== 1. canonicalName 同义词映射 =====
console.log('\n[1] canonicalName 同义词');
check('西红柿 → 番茄', canonicalName('西红柿') === '番茄');
check('番茄 → 番茄（不变）', canonicalName('番茄') === '番茄');
check('圣女果 → 小番茄', canonicalName('圣女果') === '小番茄');
check('小番茄 → 小番茄（不变）', canonicalName('小番茄') === '小番茄');

// ===== 2. 复现 recipeItemMatches 判定（做菜页"待购买"徽标来源）=====
function recipeItemMatchStatus(items: PantryItem[], ris: RecipeItem[]): Record<string, string> {
  const activeNames = new Set(items.filter(p => p.status === 'active').map(p => canonicalName(p.name)));
  const out: Record<string, string> = {};
  for (const r of ris) {
    out[r.id] = activeNames.has(canonicalName(r.name)) ? 'matched' : 'to_buy';
  }
  return out;
}

console.log('\n[2] 做菜页判定：食材库有 西红柿3，食谱要用 番茄1');
{
  const items = [pantry('西红柿', '3个')];
  const ris = [ri('R1', '番茄', '1个')];
  const st = recipeItemMatchStatus(items, ris);
  check('番茄 判定为 matched（不再是 to_buy）', st[ris[0].id] === 'matched');

  // 反向：食材库有 番茄，食谱要用 西红柿
  const items2 = [pantry('番茄', '3个')];
  const ris2 = [ri('R1', '西红柿', '1个')];
  const st2 = recipeItemMatchStatus(items2, ris2);
  check('反向：西红柿 也能匹配到 番茄', st2[ris2[0].id] === 'matched');

  // 圣女果/小番茄
  const items3 = [pantry('小番茄', '10个')];
  const ris3 = [ri('R1', '圣女果', '5个')];
  const st3 = recipeItemMatchStatus(items3, ris3);
  check('圣女果 匹配到 小番茄', st3[ris3[0].id] === 'matched');
}

// ===== 3. 复现 virtualToBuyItems 决策（食材库"待购买"区来源）=====
function virtualToBuyDecision(items: PantryItem[], ris: RecipeItem[], recipes: Recipe[]): string[] {
  const alloc = allocateCompletedUsage(items, ris, recipes);
  const existingNames = new Set(items.filter(p => p.status === 'active' || p.status === 'to_buy').map(p => canonicalName(p.name)));
  const activeRecipeIds = new Set(recipes.filter(r => r.active !== false).map(r => r.id));
  const toBuy: string[] = [];
  const demandMap = new Map<string, { num: number; den: number; unit: string }>();
  for (const r of ris) {
    if (!activeRecipeIds.has(r.recipeId)) continue;
    const p = parseQuantity(r.quantity); if (!p) continue;
    const c = canonicalName(r.name);
    const ex = demandMap.get(c);
    if (ex) { if (unitsMatch(ex.unit, p.unit)) { const a = addFraction(ex.num, ex.den, p.numerator, p.denominator); ex.num = a.num; ex.den = a.den; } }
    else demandMap.set(c, { num: p.numerator, den: p.denominator, unit: p.unit });
  }
  for (const [name, demand] of demandMap) {
    if (!existingNames.has(name)) { toBuy.push(name); continue; }
    const matching = items.filter(p => p.status === 'active' && canonicalName(p.name) === name);
    if (matching.length === 0) continue;
    let availNum = 0, availDen = 1, has = false;
    for (const m of matching) {
      const op = parseQuantity(m.originalQuantity || m.quantity); if (!op || !unitsMatch(op.unit, demand.unit)) continue;
      let remN = op.numerator, remD = op.denominator;
      const d = alloc.deductions.get(m.id);
      if (d) { const r = subtractFraction(remN, remD, d.num, d.den); remN = r.num; remD = r.den; }
      const a = addFraction(availNum, availDen, remN, remD); availNum = a.num; availDen = a.den; has = true;
    }
    if (!has) continue;
    const s = subtractFraction(demand.num, demand.den, availNum, availDen);
    if (s.num > 0) toBuy.push(name);
  }
  return toBuy;
}

console.log('\n[3] 食材库待购买区：西红柿3 + 番茄1（活跃食谱）');
{
  const items = [pantry('西红柿', '3个')];
  const recipesList = [recipe('R1', true)];
  const ris = [ri('R1', '番茄', '1个')];
  const toBuy = virtualToBuyDecision(items, ris, recipesList);
  check('不应生成 番茄 待购买项', !toBuy.includes('番茄'));
  check('待购买列表为空', toBuy.length === 0);
}

console.log('\n[4] 反向 + 数量不足时仍应提示买');
{
  // 食材库只有 西红柿1，食谱要 番茄3 → 应提示缺 2
  const items = [pantry('西红柿', '1个')];
  const recipesList = [recipe('R1', true)];
  const ris = [ri('R1', '番茄', '3个')];
  const toBuy = virtualToBuyDecision(items, ris, recipesList);
  check('数量不足时应生成 番茄 待购买（缺2个）', toBuy.includes('番茄'));
}
{
  // 完全没有该食材 → 应提示买
  const items: PantryItem[] = [];
  const recipesList = [recipe('R1', true)];
  const ris = [ri('R1', '番茄', '1个')];
  const toBuy = virtualToBuyDecision(items, ris, recipesList);
  check('无库存时应生成 番茄 待购买', toBuy.includes('番茄'));
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
