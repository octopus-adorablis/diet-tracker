-- 食材消耗记录字段
-- 用于记录菜谱完成后，食材被消耗的历史记录（JSON数组）
-- 示例值: [{"r":"清炒苦瓜","q":"100g"}]
-- 前端读取时用 `|| ''` 兜底空值，已有食材默认无消耗记录

ALTER TABLE pantry_items ADD COLUMN used_quantity text;
