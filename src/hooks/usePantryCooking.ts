import { useState, useEffect, useCallback, useMemo } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import {
  getPantryItems, addPantryItem, updatePantryItem, deletePantryItem,
  updatePantrySortOrders,
  getRecipes, addRecipe, updateRecipe, deleteRecipe,
  getRecipeItems, addRecipeItem, updateRecipeItem, deleteRecipeItem,
} from '../lib/supabase';
import type { PantryItem, Recipe, RecipeItem, PantryUsage, RecipeItemWithMatch, PantryStatus } from '../types';

const DEMO_PANTRY_KEY = 'diet_tracker_demo_pantry';
const DEMO_RECIPES_KEY = 'diet_tracker_demo_recipes';
const DEMO_RECIPE_ITEMS_KEY = 'diet_tracker_demo_recipe_items';

function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  return url !== '' && url !== 'https://placeholder.supabase.co';
}

// ===== Demo 模式 localStorage 工具函数 =====

function getDemoPantry(): PantryItem[] {
  try { return JSON.parse(localStorage.getItem(DEMO_PANTRY_KEY) || '[]'); } catch { return []; }
}
function saveDemoPantry(items: PantryItem[]) {
  localStorage.setItem(DEMO_PANTRY_KEY, JSON.stringify(items));
}
function getDemoRecipes(): Recipe[] {
  try { return JSON.parse(localStorage.getItem(DEMO_RECIPES_KEY) || '[]'); } catch { return []; }
}
function saveDemoRecipes(items: Recipe[]) {
  localStorage.setItem(DEMO_RECIPES_KEY, JSON.stringify(items));
}
function getDemoRecipeItems(): RecipeItem[] {
  try { return JSON.parse(localStorage.getItem(DEMO_RECIPE_ITEMS_KEY) || '[]'); } catch { return []; }
}
function saveDemoRecipeItems(items: RecipeItem[]) {
  localStorage.setItem(DEMO_RECIPE_ITEMS_KEY, JSON.stringify(items));
}

function genId() {
  return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ===== 主 Hook =====

export function usePantryCooking(userId: string | undefined, isDemo: boolean) {
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
  const [loading, setLoading] = useState(true);

  const configured = isSupabaseConfigured();

  // ===== 加载数据 =====
  const fetchAll = useCallback(async () => {
    if (!userId) {
      setPantryItems([]); setRecipes([]); setRecipeItems([]); setLoading(false);
      return;
    }

    if (isDemo || !configured) {
      setPantryItems(getDemoPantry());
      setRecipes(getDemoRecipes());
      setRecipeItems(getDemoRecipeItems());
      setLoading(false);
      return;
    }

    setLoading(true);
    const [p, r, ri] = await Promise.all([
      getPantryItems(userId),
      getRecipes(userId),
      getRecipeItems(userId),
    ]);
    setPantryItems(p);
    setRecipes(r);
    setRecipeItems(ri);
    setLoading(false);
  }, [userId, isDemo, configured]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ===== 实时计算：虚拟待买项 =====
  // 菜谱食材中，未匹配到任何现有/待买食材的，自动生成虚拟待买项
  const virtualToBuyItems = useMemo(() => {
    const existingNames = new Set(
      pantryItems
        .filter(p => p.status === 'active' || p.status === 'to_buy')
        .map(p => p.name)
    );
    const virtualItems: PantryItem[] = [];
    const seenNames = new Set<string>();

    const sorted = [...recipeItems].sort((a, b) => a.name.localeCompare(b.name));
    for (const ri of sorted) {
      if (!existingNames.has(ri.name) && !seenNames.has(ri.name)) {
        seenNames.add(ri.name);
        virtualItems.push({
          id: `virtual-${ri.name}`,
          userId: userId || '',
          name: ri.name,
          quantity: ri.quantity,
          status: 'to_buy' as PantryStatus,
          createdAt: '',
          isVirtual: true,
        });
      }
    }
    return virtualItems;
  }, [pantryItems, recipeItems, userId]);

  // 合并所有食材（现有 + 待买 + 已用完 + 虚拟待买）
  const allPantryItems = useMemo(() => {
    return [...pantryItems, ...virtualToBuyItems];
  }, [pantryItems, virtualToBuyItems]);

  // ===== 食材库 CRUD =====

  const createPantryItem = useCallback(async (name: string, quantity: string, status: PantryStatus) => {
    if (!userId) return;
    if (isDemo || !configured) {
      const existing = getDemoPantry();
      const maxOrder = Math.max(0, ...existing.filter(p => p.status === 'active').map(p => p.sortOrder ?? 0));
      const item: PantryItem = { id: genId(), userId, name, quantity, status, createdAt: new Date().toISOString(), sortOrder: status === 'active' ? maxOrder + 1 : 0 };
      const updated = [...existing, item];
      saveDemoPantry(updated);
      setPantryItems(updated);
      return;
    }
    const maxOrder = Math.max(0, ...pantryItems.filter(p => p.status === 'active').map(p => p.sortOrder ?? 0));
    const result = await addPantryItem({ userId, name, quantity, status, sortOrder: status === 'active' ? maxOrder + 1 : 0 });
    if (result) setPantryItems(prev => [...prev, result]);
  }, [userId, isDemo, configured, pantryItems]);

  const editPantryItem = useCallback(async (id: string, updates: Partial<PantryItem>) => {
    if (isDemo || !configured) {
      const updated = getDemoPantry().map(p => p.id === id ? { ...p, ...updates } : p);
      saveDemoPantry(updated);
      setPantryItems(updated);
      return;
    }
    await updatePantryItem(id, updates);
    setPantryItems(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, [isDemo, configured]);

  const removePantryItem = useCallback(async (id: string) => {
    if (isDemo || !configured) {
      const updated = getDemoPantry().filter(p => p.id !== id);
      saveDemoPantry(updated);
      setPantryItems(updated);
      return;
    }
    await deletePantryItem(id);
    setPantryItems(prev => prev.filter(p => p.id !== id));
  }, [isDemo, configured]);

  // 勾选/取消勾选食材
  const toggleChecked = useCallback(async (id: string) => {
    const item = pantryItems.find(p => p.id === id);
    if (!item) return;
    const newStatus = item.status === 'checked' ? 'active' : 'checked';
    await editPantryItem(id, { status: newStatus });
  }, [pantryItems, editPantryItem]);

  // 待买 → 现有（买好了，确认数量）
  // 虚拟待买项（菜谱自动生成的）需要创建新记录，真实待买项直接更新状态
  const convertToBuyToActive = useCallback(async (id: string, quantity: string) => {
    if (id.startsWith('virtual-')) {
      const virtualItem = virtualToBuyItems.find(v => v.id === id);
      if (virtualItem && userId) {
        await createPantryItem(virtualItem.name, quantity, 'active');
      }
      return;
    }
    await editPantryItem(id, { status: 'active', quantity });
  }, [virtualToBuyItems, userId, createPantryItem, editPantryItem]);

  // 拖拽排序：重新排列现有食材
  const reorderPantryItems = useCallback(async (activeList: PantryItem[], oldIndex: number, newIndex: number) => {
    const reordered = arrayMove(activeList, oldIndex, newIndex);
    const updates = reordered.map((item, idx) => ({ id: item.id, sortOrder: idx }));
    const orderMap = new Map(updates.map(u => [u.id, u.sortOrder]));

    // 乐观更新内存
    setPantryItems(prev => prev.map(p =>
      orderMap.has(p.id) ? { ...p, sortOrder: orderMap.get(p.id) } : p
    ));

    if (isDemo || !configured) {
      const all = getDemoPantry().map(p =>
        orderMap.has(p.id) ? { ...p, sortOrder: orderMap.get(p.id) } : p
      );
      saveDemoPantry(all);
      return;
    }

    await updatePantrySortOrders(updates);
  }, [isDemo, configured]);

  // ===== 菜谱 CRUD =====

  const createRecipe = useCallback(async (title: string): Promise<Recipe | null> => {
    if (!userId) return null;
    if (isDemo || !configured) {
      const recipe: Recipe = { id: genId(), userId, title, createdAt: new Date().toISOString() };
      const updated = [...getDemoRecipes(), recipe];
      saveDemoRecipes(updated);
      setRecipes(updated);
      return recipe;
    }
    const result = await addRecipe({ userId, title });
    if (result) setRecipes(prev => [...prev, result]);
    return result;
  }, [userId, isDemo, configured]);

  const editRecipeTitle = useCallback(async (id: string, title: string) => {
    if (isDemo || !configured) {
      const updated = getDemoRecipes().map(r => r.id === id ? { ...r, title } : r);
      saveDemoRecipes(updated);
      setRecipes(updated);
      return;
    }
    await updateRecipe(id, title);
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, title } : r));
  }, [isDemo, configured]);

  const removeRecipe = useCallback(async (id: string) => {
    if (isDemo || !configured) {
      saveDemoRecipes(getDemoRecipes().filter(r => r.id !== id));
      saveDemoRecipeItems(getDemoRecipeItems().filter(ri => ri.recipeId !== id));
      setRecipes(getDemoRecipes());
      setRecipeItems(getDemoRecipeItems());
      return;
    }
    await deleteRecipe(id);
    setRecipes(prev => prev.filter(r => r.id !== id));
    setRecipeItems(prev => prev.filter(ri => ri.recipeId !== id));
  }, [isDemo, configured]);

  // ===== 菜谱食材 CRUD =====

  const createRecipeItem = useCallback(async (recipeId: string, name: string, quantity: string) => {
    if (isDemo || !configured) {
      const item: RecipeItem = { id: genId(), recipeId, name, quantity };
      const updated = [...getDemoRecipeItems(), item];
      saveDemoRecipeItems(updated);
      setRecipeItems(updated);
      return;
    }
    const result = await addRecipeItem({ recipeId, name, quantity });
    if (result) setRecipeItems(prev => [...prev, result]);
  }, [isDemo, configured]);

  const editRecipeItem = useCallback(async (id: string, updates: Partial<RecipeItem>) => {
    if (isDemo || !configured) {
      const updated = getDemoRecipeItems().map(ri => ri.id === id ? { ...ri, ...updates } : ri);
      saveDemoRecipeItems(updated);
      setRecipeItems(updated);
      return;
    }
    await updateRecipeItem(id, updates);
    setRecipeItems(prev => prev.map(ri => ri.id === id ? { ...ri, ...updates } : ri));
  }, [isDemo, configured]);

  const removeRecipeItem = useCallback(async (id: string) => {
    if (isDemo || !configured) {
      const updated = getDemoRecipeItems().filter(ri => ri.id !== id);
      saveDemoRecipeItems(updated);
      setRecipeItems(updated);
      return;
    }
    await deleteRecipeItem(id);
    setRecipeItems(prev => prev.filter(ri => ri.id !== id));
  }, [isDemo, configured]);

  // ===== 实时计算：食材使用记录 =====
  const pantryUsageMap = useMemo(() => {
    const map = new Map<string, PantryUsage[]>();

    const activeSorted = pantryItems
      .filter(p => p.status === 'active')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const toBuySorted = pantryItems
      .filter(p => p.status === 'to_buy')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const firstActiveByName = new Map<string, PantryItem>();
    for (const p of activeSorted) {
      if (!firstActiveByName.has(p.name)) firstActiveByName.set(p.name, p);
    }
    const firstToBuyByName = new Map<string, PantryItem>();
    for (const p of toBuySorted) {
      if (!firstToBuyByName.has(p.name)) firstToBuyByName.set(p.name, p);
    }

    const firstVirtualByName = new Map<string, PantryItem>();
    for (const v of virtualToBuyItems) {
      if (!firstVirtualByName.has(v.name)) firstVirtualByName.set(v.name, v);
    }

    for (const ri of recipeItems) {
      const recipe = recipes.find(r => r.id === ri.recipeId);
      if (!recipe) continue;

      const usage: PantryUsage = {
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        recipeItemName: ri.name,
        recipeItemQuantity: ri.quantity,
      };

      const match = firstActiveByName.get(ri.name) || firstToBuyByName.get(ri.name) || firstVirtualByName.get(ri.name);
      if (match) {
        const list = map.get(match.id) || [];
        list.push(usage);
        map.set(match.id, list);
      }
    }

    return map;
  }, [pantryItems, recipeItems, recipes, virtualToBuyItems]);

  const getPantryUsage = useCallback((pantryItemId: string): PantryUsage[] => {
    return pantryUsageMap.get(pantryItemId) || [];
  }, [pantryUsageMap]);

  // ===== 实时计算：菜谱食材匹配状态 =====
  const recipeItemMatches = useMemo(() => {
    const activeNames = new Set(
      pantryItems.filter(p => p.status === 'active').map(p => p.name)
    );

    return recipeItems.map(ri => {
      const matched = activeNames.has(ri.name);
      const matchedPantryItem = pantryItems.find(p => p.status === 'active' && p.name === ri.name);
      return {
        ...ri,
        matchStatus: matched ? 'matched' as const : 'to_buy' as const,
        matchedPantryItem,
      } as RecipeItemWithMatch;
    });
  }, [recipeItems, pantryItems]);

  const getRecipeItemsWithMatch = useCallback((recipeId: string): RecipeItemWithMatch[] => {
    return recipeItemMatches.filter(ri => ri.recipeId === recipeId);
  }, [recipeItemMatches]);

  return {
    pantryItems: allPantryItems,
    recipes,
    recipeItems,
    loading,
    createPantryItem,
    editPantryItem,
    removePantryItem,
    toggleChecked,
    convertToBuyToActive,
    reorderPantryItems,
    createRecipe,
    editRecipeTitle,
    removeRecipe,
    createRecipeItem,
    editRecipeItem,
    removeRecipeItem,
    getPantryUsage,
    getRecipeItemsWithMatch,
  };
}
