-- 食材库 & 做菜功能 - 数据库表创建脚本
-- 在 Supabase Dashboard → SQL Editor 中执行此脚本

-- 创建 pantry_items 表（食材库）
CREATE TABLE IF NOT EXISTS pantry_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'to_buy', 'checked')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pantry_items_user_id ON pantry_items(user_id);
CREATE INDEX IF NOT EXISTS idx_pantry_items_user_status ON pantry_items(user_id, status);

ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pantry items" ON pantry_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pantry items" ON pantry_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pantry items" ON pantry_items
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pantry items" ON pantry_items
  FOR DELETE USING (auth.uid() = user_id);

-- 创建 recipes 表（菜谱）
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);

ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recipes" ON recipes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recipes" ON recipes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recipes" ON recipes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recipes" ON recipes
  FOR DELETE USING (auth.uid() = user_id);

-- 创建 recipe_items 表（菜谱食材）
CREATE TABLE IF NOT EXISTS recipe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe_id ON recipe_items(recipe_id);

ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recipe items" ON recipe_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_items.recipe_id AND recipes.user_id = auth.uid())
  );
CREATE POLICY "Users can insert own recipe items" ON recipe_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_id AND recipes.user_id = auth.uid())
  );
CREATE POLICY "Users can update own recipe items" ON recipe_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_items.recipe_id AND recipes.user_id = auth.uid())
  );
CREATE POLICY "Users can delete own recipe items" ON recipe_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_items.recipe_id AND recipes.user_id = auth.uid())
  );
