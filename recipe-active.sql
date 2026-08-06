-- 菜谱激活/关闭功能
-- 给 recipes 表加 active 字段，默认 true（已有菜谱自动保持激活）
-- 必须先执行此 SQL，再推送代码，否则查询会报错
ALTER TABLE recipes ADD COLUMN active boolean DEFAULT true;
