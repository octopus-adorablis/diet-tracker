import { createClient } from '@supabase/supabase-js';
import type { MealData } from '../types';

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
