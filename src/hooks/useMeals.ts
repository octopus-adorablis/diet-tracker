import { useState, useEffect, useCallback } from 'react';
import { getMeals, addMeal, deleteMeal } from '../lib/supabase';
import type { MealData } from '../types';

const DEMO_STORAGE_KEY = 'diet_tracker_demo_meals';

function getDemoMeals(): MealData[] {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDemoMeals(meals: MealData[]) {
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(meals));
}

export function useMeals(userId: string | undefined, isDemo: boolean) {
  const [meals, setMeals] = useState<MealData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMeals = useCallback(async () => {
    if (!userId) {
      setMeals([]);
      setLoading(false);
      return;
    }

    if (isDemo) {
      setMeals(getDemoMeals());
      setLoading(false);
      return;
    }

    setLoading(true);
    const data = await getMeals(userId);
    setMeals(data);
    setLoading(false);
  }, [userId, isDemo]);

  useEffect(() => {
    fetchMeals();
  }, [fetchMeals]);

  const createMeal = useCallback(async (meal: MealData) => {
    if (isDemo) {
      const newMeal = { ...meal, id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
      const updated = [newMeal, ...getDemoMeals()];
      saveDemoMeals(updated);
      setMeals(updated);
      return newMeal;
    }

    const result = await addMeal(meal);
    if (result) {
      setMeals(prev => [result, ...prev]);
      return result;
    }
    throw new Error('保存数据失败，请检查网络连接');
  }, [isDemo]);

  const removeMeal = useCallback(async (mealId: string) => {
    if (isDemo) {
      const updated = getDemoMeals().filter(m => m.id !== mealId);
      saveDemoMeals(updated);
      setMeals(updated);
      return true;
    }

    const success = await deleteMeal(mealId);
    if (success) {
      setMeals(prev => prev.filter(m => m.id !== mealId));
    }
    return success;
  }, [isDemo]);

  return { meals, loading, fetchMeals, createMeal, removeMeal };
}
