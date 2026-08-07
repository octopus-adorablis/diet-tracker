-- 菜谱排序字段
-- 为 recipes 表添加 sort_order 列，支持菜谱拖拽排序
-- 执行时间：必须在推送代码之前执行

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
