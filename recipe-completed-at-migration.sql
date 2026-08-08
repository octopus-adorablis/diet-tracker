-- 菜谱加"完成时间"字段
-- 用于判断：新买的食材不应匹配历史上已完成的菜谱

-- 1. 添加 completed_at 列
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2. 已完成的旧菜谱（active=false）补设完成时间为现在
--    这样当前已入库的食材仍能正常匹配，只有之后新买的食材不会误匹配
UPDATE recipes SET completed_at = now() WHERE active = false AND completed_at IS NULL;
