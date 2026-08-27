// 验证「报损语义翻转」：UI 层 quantitySubtract 把损耗量折算成剩余量，
// hook 端 computeLossFromEdit(base, 剩余) 应得到正确的损耗记录。
import { quantitySubtract } from '../src/lib/quantity';
import { computeLossFromEdit } from '../src/lib/pantry-allocation';
import type { LossReason } from '../src/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.log(`✗ ${name} ${extra}`); }
}

// 1. 损耗量 → 剩余量（反转核心）
// 青椒 500g，坏 100g → 剩 400g
check('500g 损耗 100g → 剩 400g', quantitySubtract('500g', '100g') === '400g', quantitySubtract('500g', '100g'));
// 损耗缺单位时借用基准单位
check('500g 损耗 100（无单位）→ 剩 400g', quantitySubtract('500g', '100') === '400g', quantitySubtract('500g', '100'));
// 克 互通
check('500克 损耗 100g → 剩 400克', quantitySubtract('500克', '100g') === '400克', quantitySubtract('500克', '100g'));
// 损耗为 0 → 剩 base
check('500g 损耗 0 → 剩 500g', quantitySubtract('500g', '0') === '500g', quantitySubtract('500g', '0'));
// 损耗超过库存 → 归零
check('500g 损耗 999g → 剩 0g', quantitySubtract('500g', '999g') === '0g', quantitySubtract('500g', '999g'));
// 单位不匹配 → null（UI 据此视为「不损耗」）
check('500g 损耗 100个 → null', quantitySubtract('500g', '100个') === null, String(quantitySubtract('500g', '100个')));

// 2. 翻转后的端到端：UI 把损耗量折算成剩余量，hook 据此算损耗
// 模拟 PantryEditRow：用户填损耗 100g，lossText→remaining=400g 写回 editQty
const base = '500g';
const lossInput = '100g';
const remaining = quantitySubtract(base, lossInput); // '400g'
check('UI 折算剩余量', remaining === '400g', String(remaining));

// hook 端：computeLossFromEdit(old=base, new=remaining)
const loss = computeLossFromEdit(base, remaining || base, 'spoiled' as LossReason, 'L1');
check('hook 算出损耗 100g', !!loss && loss.quantity === '100g', loss?.quantity);
check('hook 损耗原因=变质', loss?.reason === 'spoiled', loss?.reason);

// 3. 多次累计报损
// 第一次：500g 坏 100g → 剩 400g（记录 100g）
const remaining1 = quantitySubtract('500g', '100g'); // '400g'
const loss1 = computeLossFromEdit('500g', remaining1 || '500g', 'spoiled' as LossReason, 'L1');
check('第一次损耗 100g', loss1?.quantity === '100g', loss1?.quantity);
// 第二次：基于剩余 400g 再坏 50g → 剩 350g（记录 50g）
const remaining2 = quantitySubtract('400g', '50g'); // '350g'
const loss2 = computeLossFromEdit('400g', remaining2 || '400g', 'expired' as LossReason, 'L2');
check('第二次损耗 50g', loss2?.quantity === '50g', loss2?.quantity);
check('第二次剩余 350g', remaining2 === '350g', remaining2);

// 4. 非损耗模式（普通修正）：UI 直接写剩余量，lossReason 为 undefined
const normalEdit = computeLossFromEdit('500g', '450g', undefined, 'L3');
check('普通改数量不记损耗', normalEdit === null, String(normalEdit));

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
