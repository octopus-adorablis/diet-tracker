import { useState, useEffect, useCallback, useMemo } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import {
  getPantryItems, addPantryItem, updatePantryItem, deletePantryItem,
  updatePantrySortOrders,
  getRecipes, addRecipe, updateRecipe, updateRecipeActive, deleteRecipe,
  updateRecipeSortOrders,
  getRecipeItems, addRecipeItem, updateRecipeItem, deleteRecipeItem,
} from '../lib/supabase';
import type { PantryItem, Recipe, RecipeItem, PantryUsage, RecipeItemWithMatch, PantryStatus, PantryCategory, ConsumptionRecord } from '../types';

const DEMO_PANTRY_KEY = 'diet_tracker_demo_pantry';
const DEMO_RECIPES_KEY = 'diet_tracker_demo_recipes';
const DEMO_RECIPE_ITEMS_KEY = 'diet_tracker_demo_recipe_items';

function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  return url !== '' && url !== 'https://placeholder.supabase.co';
}

// ===== 数量解析工具 =====
// 解析数量文本为 { number, unit }，支持小数、分数、中文数字
// "200g" → { number: 200, unit: "g" }
// "1/3根" → { number: 0.333, unit: "根" }
// "半根" → { number: 0.5, unit: "根" }
// "两根" → { number: 2, unit: "根" }
// "剩100g" → { number: 100, unit: "g" }  (去掉"剩"前缀)
// "少许" → null
const CHINESE_NUMBERS: Record<string, number> = {
  '半': 0.5, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

function parseQuantity(q: string): { number: number; unit: string } | null {
  let s = q.trim();
  if (!s) return null;

  // 去掉"剩"前缀（减法后的剩余量）
  if (s.startsWith('剩')) s = s.slice(1).trim();

  // 分数：1/3根、2/3根
  let m = s.match(/^(\d+)\/(\d+)\s*(.*)$/);
  if (m) {
    const denom = parseInt(m[2]);
    if (denom === 0) return null;
    return { number: parseInt(m[1]) / denom, unit: m[3] || '' };
  }

  // 小数/整数：200g、0.5根、100g
  m = s.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (m) {
    return { number: parseFloat(m[1]), unit: m[2] || '' };
  }

  // 中文数字：半根、两根、三根、一罐
  for (const [cn, num] of Object.entries(CHINESE_NUMBERS)) {
    if (s.startsWith(cn)) {
      return { number: num, unit: s.slice(cn.length).trim() || '' };
    }
  }

  return null;
}

// 格式化剩余量：100 + "g" → "剩100g"，0.5 + "根" → "剩0.5根"
function formatRemaining(num: number, unit: string): string {
  const formatted = num % 1 === 0
    ? String(num)
    : num.toFixed(2).replace(/\.?0+$/, '');
  return `剩${formatted}${unit}`;
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

// 解析 usedQuantity JSON 字符串为消耗记录数组
function parseUsedQuantity(s?: string): ConsumptionRecord[] {
  if (!s) return [];
  try { return JSON.parse(s) as ConsumptionRecord[]; } catch { return []; }
}

// 从消耗记录计算累计已使用量（按单位分组累加数字）
// 如 [{q:"100g"},{q:"80g"}] → "180g"；[{q:"100g"},{q:"2根"}] → "100g、2根"
function getTotalUsedQuantity(records: ConsumptionRecord[]): string {
  if (records.length === 0) return '';
  const byUnit = new Map<string, number>();
  for (const r of records) {
    const m = r.q.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (m) {
      const num = parseFloat(m[1]);
      const unit = m[2] || '';
      byUnit.set(unit, (byUnit.get(unit) || 0) + num);
    } else {
      byUnit.set(r.q, -1);
    }
  }
  const parts: string[] = [];
  for (const [unit, num] of byUnit) {
    if (num === -1) parts.push(unit);
    else parts.push(`${num % 1 === 0 ? num : num.toFixed(1)}${unit}`);
  }
  return parts.join('、');
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
    // 只考虑激活中的菜谱（已关闭的菜谱不再提示买菜）
    const activeRecipeIds = new Set(recipes.filter(r => r.active !== false).map(r => r.id));
    const virtualItems: PantryItem[] = [];
    const seenNames = new Set<string>();

    const sorted = [...recipeItems]
      .filter(ri => activeRecipeIds.has(ri.recipeId))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const ri of sorted) {
      if (!existingNames.has(ri.name) && !seenNames.has(ri.name)) {
        seenNames.add(ri.name);
        virtualItems.push({
          id: `virtual-${ri.name}`,
          userId: userId || '',
          name: ri.name,
          quantity: ri.quantity,
          status: 'to_buy' as PantryStatus,
          category: 'other' as PantryCategory,
          createdAt: '',
          isVirtual: true,
        });
      }
    }
    return virtualItems;
  }, [pantryItems, recipeItems, recipes, userId]);

  // 合并所有食材（现有 + 待买 + 已用完 + 虚拟待买），兜底旧数据缺失的 category
  const allPantryItems = useMemo(() => {
    return [...pantryItems, ...virtualToBuyItems].map(p => ({
      ...p,
      category: (p.category || 'other') as PantryCategory,
    }));
  }, [pantryItems, virtualToBuyItems]);

  // ===== 食材库 CRUD =====

  const createPantryItem = useCallback(async (name: string, quantity: string, status: PantryStatus) => {
    if (!userId) return;
    if (isDemo || !configured) {
      const existing = getDemoPantry();
      const maxOrder = Math.max(0, ...existing.filter(p => p.status === 'active').map(p => p.sortOrder ?? 0));
      const item: PantryItem = { id: genId(), userId, name, quantity, status, category: 'other', createdAt: new Date().toISOString(), sortOrder: status === 'active' ? maxOrder + 1 : 0 };
      const updated = [...existing, item];
      saveDemoPantry(updated);
      setPantryItems(updated);
      return;
    }
    const maxOrder = Math.max(0, ...pantryItems.filter(p => p.status === 'active').map(p => p.sortOrder ?? 0));
    const result = await addPantryItem({ userId, name, quantity, status, category: 'other', sortOrder: status === 'active' ? maxOrder + 1 : 0 });
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

  // 拖拽到象限：修改食材分类（四象限模式下跨象限拖拽）
  const setPantryCategory = useCallback(async (id: string, category: PantryCategory) => {
    if (id.startsWith('virtual-')) return;
    // 新拖入的食材放在目标象限末尾
    const maxOrder = Math.max(-1, ...pantryItems
      .filter(p => p.status === 'active' && p.category === category)
      .map(p => p.sortOrder ?? 0));
    await editPantryItem(id, { category, sortOrder: maxOrder + 1 });
  }, [pantryItems, editPantryItem]);

  // 批量修改分类：多选食材一起拖到目标象限
  const setPantryCategoryBatch = useCallback(async (ids: string[], category: PantryCategory) => {
    const realIds = ids.filter(id => !id.startsWith('virtual-'));
    if (realIds.length === 0) return;
    // 目标象限当前最大 sortOrder，批量分配递增顺序
    const maxOrder = Math.max(-1, ...pantryItems
      .filter(p => p.status === 'active' && p.category === category)
      .map(p => p.sortOrder ?? 0));
    const orderMap = new Map<string, { category: PantryCategory; sortOrder: number }>(
      realIds.map((id, idx) => [id, { category, sortOrder: maxOrder + 1 + idx }])
    );
    // 乐观更新
    setPantryItems(prev => prev.map(p =>
      orderMap.has(p.id) ? { ...p, ...orderMap.get(p.id) } : p
    ));
    if (isDemo || !configured) {
      const all = getDemoPantry().map(p =>
        orderMap.has(p.id) ? { ...p, ...orderMap.get(p.id) } : p
      );
      saveDemoPantry(all);
      return;
    }
    await Promise.all(
      realIds.map((id, idx) => updatePantryItem(id, { category, sortOrder: maxOrder + 1 + idx }))
    );
  }, [pantryItems, isDemo, configured]);

  // ===== 菜谱 CRUD =====

  const createRecipe = useCallback(async (title: string): Promise<Recipe | null> => {
    if (!userId) return null;
    if (isDemo || !configured) {
      const maxOrder = Math.max(0, ...getDemoRecipes().map(r => r.sortOrder ?? 0));
      const recipe: Recipe = { id: genId(), userId, title, createdAt: new Date().toISOString(), active: true, sortOrder: maxOrder + 1 };
      const updated = [...getDemoRecipes(), recipe];
      saveDemoRecipes(updated);
      setRecipes(updated);
      return recipe;
    }
    const maxOrder = Math.max(0, ...recipes.map(r => r.sortOrder ?? 0));
    const result = await addRecipe({ userId, title, sortOrder: maxOrder + 1 });
    if (result) setRecipes(prev => [...prev, result]);
    return result;
  }, [userId, isDemo, configured, recipes]);

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

  // 切换菜谱激活/关闭状态
  // 关闭(点完成)：智能单位减法 + 固化消耗记录 → 关闭菜谱
  // 打开(点再做)：重新激活，不撤销已使用量（历史事实不回退）
  const toggleRecipeActive = useCallback(async (id: string) => {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;
    const newActive = recipe.active === false;

    // 点「完成」时（从激活→关闭），固化已匹配食材的消耗
    if (!newActive) {
      const activePantryByName = new Map<string, PantryItem>();
      for (const p of pantryItems) {
        if (p.status === 'active' && !activePantryByName.has(p.name)) {
          activePantryByName.set(p.name, p);
        }
      }
      const itemsOfRecipe = recipeItems.filter(ri => ri.recipeId === id);

      // 按 pantryItemId 分组，汇总每个食材的消耗
      const consumptionsByPantry = new Map<string, {
        pantryItem: PantryItem;
        records: ConsumptionRecord[];
        subtractTotal: number;
        unit: string;
      }>();

      for (const ri of itemsOfRecipe) {
        const matched = activePantryByName.get(ri.name);
        if (!matched || matched.id.startsWith('virtual-')) continue;

        let entry = consumptionsByPantry.get(matched.id);
        if (!entry) {
          entry = { pantryItem: matched, records: [], subtractTotal: 0, unit: '' };
          consumptionsByPantry.set(matched.id, entry);
        }

        // 尝试单位减法
        const pantryParsed = parseQuantity(matched.quantity);
        const recipeParsed = parseQuantity(ri.quantity);
        if (pantryParsed && recipeParsed && pantryParsed.unit === recipeParsed.unit) {
          // 单位一致 → 累加减法
          entry.subtractTotal += recipeParsed.number;
          entry.unit = pantryParsed.unit;
          entry.records.push({ r: recipe.title, q: ri.quantity, subtracted: true });
        } else {
          // 单位不一致或无法解析 → 仅记录
          entry.records.push({ r: recipe.title, q: ri.quantity });
        }
      }

      // 应用减法 + 写入消耗记录
      for (const [pantryId, entry] of consumptionsByPantry) {
        const item = entry.pantryItem;
        const updates: Partial<PantryItem> = {};
        const records = entry.records;

        if (entry.subtractTotal > 0 && entry.unit) {
          const pantryParsed = parseQuantity(item.quantity);
          if (pantryParsed && pantryParsed.unit === entry.unit) {
            const result = pantryParsed.number - entry.subtractTotal;
            if (result > 0) {
              // 正常减法
              updates.quantity = formatRemaining(result, entry.unit);
            } else if (result === 0) {
              // 正好用完
              updates.quantity = formatRemaining(0, entry.unit);
            } else {
              // 不够减：不修改 quantity，标记 records 为 insufficient
              for (const rec of records) {
                if (rec.subtracted) {
                  rec.subtracted = undefined;
                  rec.insufficient = true;
                }
              }
            }
          }
        }

        // 合并历史消耗记录
        const existing = parseUsedQuantity(item.usedQuantity);
        existing.push(...records);
        updates.usedQuantity = JSON.stringify(existing);

        await editPantryItem(pantryId, updates);
      }
    }

    // 切换菜谱状态
    if (isDemo || !configured) {
      const updated = getDemoRecipes().map(r => r.id === id ? { ...r, active: newActive } : r);
      saveDemoRecipes(updated);
      setRecipes(updated);
      return;
    }
    await updateRecipeActive(id, newActive);
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, active: newActive } : r));
  }, [recipes, pantryItems, recipeItems, editPantryItem, isDemo, configured]);

  // 撤销菜谱完成：回退减法 + 清除消耗记录 + 恢复菜谱为激活状态
  const undoRecipeCompletion = useCallback(async (id: string) => {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;

    // 遍历所有食材，找到有此菜谱消耗记录的
    for (const item of pantryItems) {
      const records = parseUsedQuantity(item.usedQuantity);
      const recipeRecords = records.filter(r => r.r === recipe.title);
      if (recipeRecords.length === 0) continue;

      // 计算需要加回的数量（仅 subtracted 的记录改过 quantity）
      let addBack = 0;
      let unit = '';
      for (const rec of recipeRecords) {
        if (rec.subtracted) {
          const parsed = parseQuantity(rec.q);
          if (parsed) { addBack += parsed.number; unit = parsed.unit; }
        }
      }

      // 移除此菜谱的消耗记录
      const remaining = records.filter(r => r.r !== recipe.title);
      const updates: Partial<PantryItem> = {};
      updates.usedQuantity = remaining.length > 0 ? JSON.stringify(remaining) : undefined;

      // 加回数量
      if (addBack > 0 && unit) {
        const currentParsed = parseQuantity(item.quantity);
        if (currentParsed && currentParsed.unit === unit) {
          const restored = currentParsed.number + addBack;
          const formatted = restored % 1 === 0 ? String(restored) : restored.toFixed(2).replace(/\.?0+$/, '');
          // 还有其他 subtracted 记录 → 保留"剩"前缀；否则去掉
          const hasOtherSubtracted = remaining.some(r => r.subtracted);
          updates.quantity = hasOtherSubtracted ? `剩${formatted}${unit}` : `${formatted}${unit}`;
        }
      }

      await editPantryItem(item.id, updates);
    }

    // 恢复菜谱为激活状态
    if (isDemo || !configured) {
      const updated = getDemoRecipes().map(r => r.id === id ? { ...r, active: true } : r);
      saveDemoRecipes(updated);
      setRecipes(updated);
      return;
    }
    await updateRecipeActive(id, true);
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, active: true } : r));
  }, [recipes, pantryItems, editPantryItem, isDemo, configured]);

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

  // 拖拽排序：重新排列菜谱
  const reorderRecipes = useCallback(async (activeList: Recipe[], oldIndex: number, newIndex: number) => {
    const reordered = arrayMove(activeList, oldIndex, newIndex);
    const updates = reordered.map((item, idx) => ({ id: item.id, sortOrder: idx }));

    // 乐观更新内存（用重排后的数组替换，不仅仅是更新 sortOrder 字段）
    setRecipes(reordered.map((r, idx) => ({ ...r, sortOrder: idx })));

    if (isDemo || !configured) {
      saveDemoRecipes(reordered.map((r, idx) => ({ ...r, sortOrder: idx })));
      return;
    }

    await updateRecipeSortOrders(updates);
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
      // 已关闭的菜谱不再参与食材使用计算
      if (recipe.active === false) continue;

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
    setPantryCategory,
    setPantryCategoryBatch,
    createRecipe,
    editRecipeTitle,
    toggleRecipeActive,
    undoRecipeCompletion,
    removeRecipe,
    reorderRecipes,
    createRecipeItem,
    editRecipeItem,
    removeRecipeItem,
    getPantryUsage,
    getRecipeItemsWithMatch,
  };
}
