-- 食材库：添加原始数量字段
-- 用于"实时计算"模式：quantity 存原始数量，剩余量由菜谱状态实时计算
ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS original_quantity text;
