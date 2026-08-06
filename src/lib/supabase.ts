import { createClient } from '@supabase/supabase-js';
import type { MealData, PantryItem, PantryCategory, Recipe, RecipeItem } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getMeals(userId: string): Promise<MealData[]> {
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('time', { ascending: true });

  if (error) {
    console.error('Error fetching meals:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    user_id: row.user_id,
    date: row.date,
    type: row.type,
    typeName: row.type_name,
    time: row.time,
    content: row.content,
    items: row.items,
    total: row.total,
    evaluation: row.evaluation,
    created_at: row.created_at,
  }));
}

export async function addMeal(meal: MealData): Promise<MealData | null> {
  console.log('Adding meal:', JSON.stringify(meal, null, 2));

  const { data, error } = await supabase
    .from('meals')
    .insert({
      user_id: meal.user_id,
      date: meal.date,
      type: meal.type,
      type_name: meal.typeName,
      time: meal.time,
      content: meal.content,
      items: meal.items,
      total: meal.total,
      evaluation: meal.evaluation,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding meal:', error);
    throw new Error(`保存失败: ${error.message} (${error.code})`);
  }

  return {
    id: data.id,
    user_id: data.user_id,
    date: data.date,
    type: data.type,
    typeName: data.type_name,
    time: data.time,
    content: data.content,
    items: data.items,
    total: data.total,
    evaluation: data.evaluation,
    created_at: data.created_at,
  };
}

export async function deleteMeal(mealId: string): Promise<boolean> {
  const { error } = await supabase
    .from('meals')
    .delete()
    .eq('id', mealId);

  if (error) {
    console.error('Error deleting meal:', error);
    return false;
  }

  return true;
}

// ===== 食材库 (pantry_items) CRUD =====

export async function getPantryItems(userId: string): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching pantry items:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    quantity: row.quantity,
    status: row.status,
    category: (row.category as PantryCategory) || 'other',
    createdAt: row.created_at,
    sortOrder: row.sort_order ?? 0,
    usedQuantity: row.used_quantity || '',
  }));
}

export async function addPantryItem(item: Omit<PantryItem, 'id' | 'createdAt'>): Promise<PantryItem | null> {
  const { data, error } = await supabase
    .from('pantry_items')
    .insert({
      user_id: item.userId,
      name: item.name,
      quantity: item.quantity,
      status: item.status,
      category: item.category || 'other',
      sort_order: item.sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding pantry item:', error);
    throw new Error(`保存失败: ${error.message}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    quantity: data.quantity,
    status: data.status,
    category: (data.category as PantryCategory) || 'other',
    createdAt: data.created_at,
    sortOrder: data.sort_order ?? 0,
    usedQuantity: data.used_quantity || '',
  };
}

export async function updatePantryItem(id: string, updates: Partial<PantryItem>): Promise<boolean> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  if (updates.usedQuantity !== undefined) dbUpdates.used_quantity = updates.usedQuantity;

  const { error } = await supabase
    .from('pantry_items')
    .update(dbUpdates)
    .eq('id', id);

  if (error) {
    console.error('Error updating pantry item:', error);
    return false;
  }

  return true;
}

export async function deletePantryItem(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('pantry_items')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting pantry item:', error);
    return false;
  }

  return true;
}

// 批量更新食材排序
export async function updatePantrySortOrders(updates: { id: string; sortOrder: number }[]): Promise<boolean> {
  const results = await Promise.all(
    updates.map(u =>
      supabase.from('pantry_items').update({ sort_order: u.sortOrder }).eq('id', u.id)
    )
  );
  return results.every(r => !r.error);
}

// ===== 菜谱 (recipes) CRUD =====

export async function getRecipes(userId: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching recipes:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    active: row.active !== false, // 兜底 true，字段缺失或 null 时视为激活
  }));
}

export async function addRecipe(recipe: Omit<Recipe, 'id' | 'createdAt'>): Promise<Recipe | null> {
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      user_id: recipe.userId,
      title: recipe.title,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding recipe:', error);
    throw new Error(`保存失败: ${error.message}`);
  }

  return {
    id: data.id,
    userId: data.user_id,
    title: data.title,
    createdAt: data.created_at,
    active: data.active !== false, // 兜底 true
  };
}

export async function updateRecipeActive(id: string, active: boolean): Promise<boolean> {
  const { error } = await supabase
    .from('recipes')
    .update({ active })
    .eq('id', id);

  if (error) {
    console.error('Error updating recipe active:', error);
    return false;
  }

  return true;
}

export async function updateRecipe(id: string, title: string): Promise<boolean> {
  const { error } = await supabase
    .from('recipes')
    .update({ title })
    .eq('id', id);

  if (error) {
    console.error('Error updating recipe:', error);
    return false;
  }

  return true;
}

export async function deleteRecipe(id: string): Promise<boolean> {
  // recipe_items 通过外键 ON DELETE CASCADE 自动删除
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting recipe:', error);
    return false;
  }

  return true;
}

// ===== 菜谱食材 (recipe_items) CRUD =====

export async function getRecipeItems(userId: string): Promise<RecipeItem[]> {
  const { data, error } = await supabase
    .from('recipe_items')
    .select('id, recipe_id, name, quantity, recipes!inner(user_id)')
    .eq('recipes.user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching recipe items:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    recipeId: row.recipe_id,
    name: row.name,
    quantity: row.quantity,
  }));
}

export async function addRecipeItem(item: Omit<RecipeItem, 'id'>): Promise<RecipeItem | null> {
  const { data, error } = await supabase
    .from('recipe_items')
    .insert({
      recipe_id: item.recipeId,
      name: item.name,
      quantity: item.quantity,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding recipe item:', error);
    throw new Error(`保存失败: ${error.message}`);
  }

  return {
    id: data.id,
    recipeId: data.recipe_id,
    name: data.name,
    quantity: data.quantity,
  };
}

export async function updateRecipeItem(id: string, updates: Partial<RecipeItem>): Promise<boolean> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity;

  const { error } = await supabase
    .from('recipe_items')
    .update(dbUpdates)
    .eq('id', id);

  if (error) {
    console.error('Error updating recipe item:', error);
    return false;
  }

  return true;
}

export async function deleteRecipeItem(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('recipe_items')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting recipe item:', error);
    return false;
  }

  return true;
}
