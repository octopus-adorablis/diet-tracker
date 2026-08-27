import { computeLossFromEdit } from '../src/lib/pantry-allocation';
import type { LossReason } from '../src/types';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

console.log('损耗计算 computeLossFromEdit：');

// 1. 减少且单位一致 → 记录损耗（量 = 差值）
{
  const loss = computeLossFromEdit('400g', '300g', 'spoiled' as LossReason, 'L1');
  check('400g→300g 记录损耗', !!loss);
  check('损耗量 = 100g', loss?.quantity === '100g', loss?.quantity);
  check('原因 = 变质', loss?.reason === 'spoiled', loss?.reason);
}

// 2. 按数量单位（个）
{
  const loss = computeLossFromEdit('2个', '1个', 'expired' as LossReason, 'L2');
  check('2个→1个 记录损耗', loss?.quantity === '1个', loss?.quantity);
  check('原因 = 过期', loss?.reason === 'expired', loss?.reason);
}

// 3. 数量增加 → 不记损耗（视为录入修正）
{
  const loss = computeLossFromEdit('300g', '400g', 'spoiled' as LossReason, 'L3');
  check('300g→400g 不记损耗', loss === null, loss);
}

// 4. 数量不变 → 不记损耗
{
  const loss = computeLossFromEdit('400g', '400g', 'spoiled' as LossReason, 'L4');
  check('400g→400g 不记损耗', loss === null, loss);
}

// 5. 单位不一致 → 不记损耗（无法计算差值）
{
  const loss = computeLossFromEdit('400g', '1个', 'spoiled' as LossReason, 'L5');
  check('400g→1个 单位不一致不记损耗', loss === null, loss);
}

// 6. 分数 / 半量
{
  const loss = computeLossFromEdit('1/2个', '0个', 'overcooked' as LossReason, 'L6');
  check('1/2个→0个 记录损耗', !!loss && loss.quantity === '1/2个', loss?.quantity);
  check('原因 = 做坏', loss?.reason === 'overcooked', loss?.reason);
}

// 7. 克 与 g 互通（损耗量沿用旧值的单位）
{
  const loss = computeLossFromEdit('500克', '200g', 'other' as LossReason, 'L7');
  check('500克→200g 记录损耗', !!loss && loss.quantity === '300克', loss?.quantity);
}

console.log(`\n损耗测试：${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
