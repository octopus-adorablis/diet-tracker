-- 给 pantry_items 表添加 sort_order 字段（用于食材拖拽排序）
ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 为现有数据初始化 sort_order（按创建时间排序，确保已有数据顺序正确）
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 AS new_order
  FROM pantry_items
)
UPDATE pantry_items SET sort_order = ranked.new_order
FROM ranked WHERE pantry_items.id = ranked.id;
