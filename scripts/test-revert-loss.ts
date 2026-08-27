import { revertLoss } from '../src/lib/pantry-allocation';
import type { PantryItem, PantryLoss } from '../src/types';

function makeItem(quantity: string, originalQuantity: string, losses: PantryLoss[]): PantryItem {
  return {
    id: 'x', userId: 'u', name: '茄子', quantity,
    status: 'active', category: 'vegetable', createdAt: '',
    originalQuantity, losses,
  };
}
function loss(q: string, id?: string): PantryLoss {
  return { id: id || Math.random().toString(36).slice(2), quantity: q, reason: 'spoiled', createdAt: new Date().toISOString() };
}

let pass = 0, fail = 0;
function check(name: string, cond: boolean, got: unknown) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, '=>', JSON.stringify(got)); }
}

// 1. 茄子误登记 640g → 归零，删除该损耗 → 恢复 640g
{
  const l = loss('640g');
  const r = revertLoss(makeItem('0g', '0g', [l]), l.id);
  check('茄子640恢复库存', r?.quantity === '640g' && r?.originalQuantity === '640g' && r?.losses.length === 0, r);
}
// 2. 青椒 400g 损耗 100g → 删除 → 500g
{
  const l = loss('100g');
  const r = revertLoss(makeItem('400g', '400g', [l]), l.id);
  check('青椒恢复500g', r?.quantity === '500g', r);
}
// 3. 单位不一致（库存 500g、损耗 2个）→ 不串加，仅删记录
{
  const l = loss('2个');
  const r = revertLoss(makeItem('500g', '500g', [l]), l.id);
  check('单位不一致不动库存', r?.quantity === '500g' && r?.losses.length === 0, r);
}
// 4. 多条损耗累加删除
{
  const l1 = loss('50g', 'a'); const l2 = loss('30g', 'b');
  const item = makeItem('300g', '300g', [l1, l2]);
  const r1 = revertLoss(item, 'a');
  check('删第一条=350g', r1?.quantity === '350g' && r1?.losses.length === 1, r1);
  const r2 = revertLoss(makeItem(r1!.quantity, r1!.originalQuantity, r1!.losses), 'b');
  check('删第二条=380g', r2?.quantity === '380g' && r2?.losses.length === 0, r2);
}
// 5. 分数：剩 1/2 根损耗 1/2 根 → 删 → 1根
{
  const l = loss('1/2根');
  const r = revertLoss(makeItem('剩1/2根', '剩1/2根', [l]), l.id);
  check('分数恢复1根', r?.quantity === '1根', r);
}
// 6. 删除不存在的损耗 → 返回 null（调用方应忽略）
{
  const l = loss('10g');
  const r = revertLoss(makeItem('100g', '100g', [l]), 'nope');
  check('不存在返回null', r === null, r);
}

console.log(`\nrevertLoss: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
