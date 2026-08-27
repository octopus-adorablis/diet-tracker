// 报损保存逻辑回归测试（单一数据源）
// 复刻 PantryEditRow.handleSave 的合约：
//   损耗模式剩余量 = quantitySubtract(baseQty, lossText || '0')，失败则退回 baseQty（不记损耗）
// 锁定：意图损耗 60g 绝不会把食材算成归零；过量才归零且需用户确认。
import { quantitySubtract } from '../src/lib/quantity';
import type { LossReason } from '../src/types';

let pass = 0, fail = 0;
function check(desc: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? '✓' : '✗'} ${desc}  => ${JSON.stringify(got)}${ok ? '' : '  (期望 ' + JSON.stringify(want) + ')'}`);
  ok ? pass++ : fail++;
}

// 模拟保存时计算的剩余量（与组件 handleSave 完全一致）
function saveRemaining(baseQty: string, editLoss: boolean, lossText: string): string {
  if (!editLoss) return baseQty; // 非损耗模式：剩余量就是用户输入的剩余量（此处仅测损耗分支，忽略）
  return quantitySubtract(baseQty, lossText || '0') ?? baseQty;
}

// 1. 茄子 640g 损耗 60g → 剩 580g（核心场景，绝不能归零）
check('640g 损耗 60g → 剩 580g', saveRemaining('640g', true, '60g'), '580g');
check('640g 损耗 60 → 剩 580g（缺单位借用）', saveRemaining('640g', true, '60'), '580g');

// 2. 意图损耗 60g 永远不会变成 0（防回归：旧实现双向同步出错会把食材算成归零）
check('640g 损耗 60g 不为 0', saveRemaining('640g', true, '60g') === '0g', false);

// 3. 空损耗文本 = 不记损耗（剩余 = 库存，无变化）
check('损耗框为空 → 剩 640g（不改）', saveRemaining('640g', true, ''), '640g');

// 4. 过量损耗才归零（且会触发告警，由 UI 层拦截确认）
check('640g 损耗 700g → 剩 0g（过量归零）', saveRemaining('640g', true, '700g'), '0g');
check('640g 损耗 640g → 剩 0g（刚好清空）', saveRemaining('640g', true, '640g'), '0g');

// 5. 单位不一致 → 退回 baseQty（不扣减，由 UI 警告）
check('640g 损耗 2个（单位不符）→ 剩 640g', saveRemaining('640g', true, '2个'), '640g');

// 6. 多次累计：先 60g 再 30g（新一次编辑以最新库存为 base）
check('二次损耗：580g 损耗 30g → 剩 550g', saveRemaining('580g', true, '30g'), '550g');

console.log(`\n报损保存逻辑：${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
