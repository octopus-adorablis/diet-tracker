-- 食材四象限分类：给 pantry_items 表新增 category 字段
-- 分类值：meat_dairy(肉类&乳制品) / vegetable(蔬菜) / staple(主食) / other(其他)
-- 现有数据自动获得默认值 'other'
-- 执行顺序：必须先执行此 SQL，再推送代码，否则查询会报错导致食材"消失"

ALTER TABLE pantry_items ADD COLUMN category text DEFAULT 'other';
