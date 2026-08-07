-- 修复 pantry_items, recipes, recipe_items 三张表的 GRANT 权限和 RLS 策略
-- 在 Supabase SQL Editor 中执行

-- ===== 1. GRANT 权限 =====
GRANT ALL ON public.pantry_items TO anon;
GRANT ALL ON public.pantry_items TO authenticated;
GRANT ALL ON public.recipes TO anon;
GRANT ALL ON public.recipes TO authenticated;
GRANT ALL ON public.recipe_items TO anon;
GRANT ALL ON public.recipe_items TO authenticated;

-- ===== 2. pantry_items RLS 策略 =====
ALTER TABLE pantry_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own pantry items" ON pantry_items;
DROP POLICY IF EXISTS "Users can insert own pantry items" ON pantry_items;
DROP POLICY IF EXISTS "Users can update own pantry items" ON pantry_items;
DROP POLICY IF EXISTS "Users can delete own pantry items" ON pantry_items;

CREATE POLICY "Users can view own pantry items" ON pantry_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pantry items" ON pantry_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pantry items" ON pantry_items
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pantry items" ON pantry_items
  FOR DELETE USING (auth.uid() = user_id);

-- ===== 3. recipes RLS 策略 =====
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recipes" ON recipes;
DROP POLICY IF EXISTS "Users can insert own recipes" ON recipes;
DROP POLICY IF EXISTS "Users can update own recipes" ON recipes;
DROP POLICY IF EXISTS "Users can delete own recipes" ON recipes;

CREATE POLICY "Users can view own recipes" ON recipes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own recipes" ON recipes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recipes" ON recipes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recipes" ON recipes
  FOR DELETE USING (auth.uid() = user_id);

-- ===== 4. recipe_items RLS 策略 =====
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recipe items" ON recipe_items;
DROP POLICY IF EXISTS "Users can insert own recipe items" ON recipe_items;
DROP POLICY IF EXISTS "Users can update own recipe items" ON recipe_items;
DROP POLICY IF EXISTS "Users can delete own recipe items" ON recipe_items;

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
