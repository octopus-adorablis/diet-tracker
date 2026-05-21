-- Diet Tracker 数据库 Schema
-- 在 Supabase SQL Editor 中执行此脚本

-- 创建 meals 表
CREATE TABLE IF NOT EXISTS meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  type_name TEXT NOT NULL,
  time TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]',
  total JSONB NOT NULL DEFAULT '{}',
  evaluation JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_meals_user_id ON meals(user_id);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, date);

-- 启用 RLS (Row Level Security)
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略：用户只能查看自己的数据
CREATE POLICY "Users can view own meals" ON meals
  FOR SELECT USING (auth.uid() = user_id);

-- 创建 RLS 策略：用户只能插入自己的数据
CREATE POLICY "Users can insert own meals" ON meals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 创建 RLS 策略：用户只能更新自己的数据
CREATE POLICY "Users can update own meals" ON meals
  FOR UPDATE USING (auth.uid() = user_id);

-- 创建 RLS 策略：用户只能删除自己的数据
CREATE POLICY "Users can delete own meals" ON meals
  FOR DELETE USING (auth.uid() = user_id);

-- 创建用户配置表（可选，用于存储用户身体数据）
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  age INTEGER,
  height INTEGER,
  weight INTEGER,
  activity TEXT,
  bmr INTEGER,
  tdee INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR ALL USING (auth.uid() = id);
