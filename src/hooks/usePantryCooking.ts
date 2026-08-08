import { useState, useEffect, useCallback, useMemo } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import {
  getPantryItems, addPantryItem, updatePantryItem, deletePantryItem,
  updatePantrySortOrders,
  getRecipes, addRecipe, updateRecipe, updateRecipeActive, deleteRecipe,
  updateRecipeSortOrders,
  getRecipeItems, addRecipeItem, updateRecipeItem, deleteRecipeItem,
} from '../lib/supabase';
import {
  parseQuantity, formatRemaining, formatQuantity,
  addFraction, subtractFraction,
} from '../lib/quantity';
import type { PantryItem, Recipe, RecipeItem, RecipeItemWithMatch, PantryStatus, PantryCategory, PantryUsageInfo, PantryDisplayInfo } from '../types';

const DEMO_PANTRY_KEY = 'diet_tracker_demo_pantry';
const DEMO_RECIPES_KEY = 'diet_tracker_demo_recipes';
const DEMO_RECIPE_ITEMS_KEY = 'diet_tracker_demo_recipe_items';

function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  return url !== '' && url !== 'https://placeholder.supabase.co';
}

// ===== 食材自动分类 =====
// 根据食材名称关键词自动判断分类，按优先级匹配
const MEAT_DAIRY_KEYWORDS = [
  // 禽肉
  '鸡', '鸭', '鹅', '鸽', '鹌鹑',
  // 红肉
  '猪', '牛', '羊', '五花肉', '排骨', '里脊', '火腿', '培根', '香肠', '腊肉', '肉', '骨', '肝', '肠', '肚', '血',
  // 海鲜水产
  '鱼', '虾', '蟹', '贝', '鱿鱼', '带鱼', '蛤', '牡蛎', '鲍鱼', '海鲜', '扇贝', '龙虾', '蛏', '海参', '墨鱼', '章鱼', '紫菜', '海带', '裙带菜', '昆布', '海苔',
  // 蛋
  '蛋',
  // 乳制品
  '牛奶', '酸奶', '奶酪', '芝士', '黄油', '奶油', '炼乳', '乳',
];

const VEGETABLE_KEYWORDS = [
  // 具体蔬菜名（优先匹配）
  '苦瓜', '黄瓜', '丝瓜', '冬瓜', '南瓜', '番茄', '西红柿', '土豆', '洋葱', '白菜', '菠菜', '生菜', '油菜', '芹菜', '韭菜', '豆角', '茄子', '青椒', '辣椒', '胡萝卜', '白萝卜', '萝卜', '蘑菇', '香菇', '木耳', '豆腐', '豆芽', '豌豆', '玉米', '菜花', '西兰花', '藕', '莲藕', '香菜', '蒜苗', '空心菜', '秋葵', '芦笋', '莴笋', '山药', '红薯', '紫薯', '蒜薹', '蒜苔', '腐竹', '娃娃菜', '圆白菜', '包菜', '荠菜', '豆苗', '茼蒿', '苋菜', '莴苣',
  // 蔬菜泛称
  '菜心', '菜叶', '瓜', '茄', '葱', '蒜', '姜', '笋', '菌', '菇', '藻',
];

const STAPLE_KEYWORDS = [
  '大米', '糯米', '小米', '糙米', '燕麦', '荞麦', '藜麦', '面粉', '面条', '挂面', '意面', '面包', '馒头', '包子', '饺子', '馄饨', '饼', '年糕', '米粉', '粉丝', '米饭', '粥', '红豆', '绿豆', '黄豆', '黑豆', '花生', '芝麻', '麻油', '面条', '河粉', '通心粉', '宽粉', '红薯粉', '绿豆粉',
];

function autoCategorize(name: string): PantryCategory {
  const lower = name.trim();
  if (!lower) return 'other';

  // 按优先级匹配：肉蛋奶 → 蔬菜 → 主食 → 其他
  if (MEAT_DAIRY_KEYWORDS.some(kw => lower.includes(kw))) return 'meat_dairy';
  if (VEGETABLE_KEYWORDS.some(kw => lower.includes(kw))) return 'vegetable';
  if (STAPLE_KEYWORDS.some(kw => lower.includes(kw))) return 'staple';
  return 'other';
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

  // ===== 懒迁移：为无 originalQuantity 的食材计算并保存原始数量 =====
  // 旧代码会在"完成"菜谱时修改 quantity（如 "2根" → "剩1根"）
  // 新代码不再修改 quantity，剩余量由菜谱状态实时计算
  // 迁移逻辑：如果 quantity 被改过（有 usedQuantity 记录），把扣减量加回去得到原始值
  const migratePantryItems = useCallback(async (items: PantryItem[]): Promise<PantryItem[]> => {
    const needMigration = items.filter(p =>
      !p.isVirtual && !p.originalQuantity && p.usedQuantity
    );
    if (needMigration.length === 0) return items;

    const migrated = [...items];
    for (const item of needMigration) {
      try {
        const records = JSON.parse(item.usedQuantity || '[]') as { q: string; subtracted?: boolean }[];
        const subtractedRecords = records.filter(r => r.subtracted);
        if (subtractedRecords.length === 0) continue;

        // 把已扣减的量加回去，得到原始数量
        const currentParsed = parseQuantity(item.quantity);
        if (!currentParsed) continue;

        let origNum = currentParsed.numerator;
        let origDen = currentParsed.denominator;
        let useFraction = currentParsed.isFraction || currentParsed.isHalf;

        for (const rec of subtractedRecords) {
          const recParsed = parseQuantity(rec.q);
          if (recParsed && recParsed.unit === currentParsed.unit) {
            const added = addFraction(origNum, origDen, recParsed.numerator, recParsed.denominator);
            origNum = added.num;
            origDen = added.den;
            useFraction = useFraction || recParsed.isFraction || recParsed.isHalf;
          }
        }

        const originalQty = formatQuantity(origNum, origDen, useFraction) + currentParsed.unit;

        // 更新数据库/localStorage
        if (isDemo || !configured) {
          const all = getDemoPantry().map(p =>
            p.id === item.id ? { ...p, quantity: originalQty, originalQuantity: originalQty } : p
          );
          saveDemoPantry(all);
        } else {
          await updatePantryItem(item.id, { quantity: originalQty, originalQuantity: originalQty });
        }

        // 更新内存
        const idx = migrated.findIndex(p => p.id === item.id);
        if (idx >= 0) {
          migrated[idx] = { ...migrated[idx], quantity: originalQty, originalQuantity: originalQty };
        }
      } catch { /* 跳过解析失败的项 */ }
    }
    return migrated;
  }, [isDemo, configured]);

  // ===== 加载数据 =====
  const fetchAll = useCallback(async () => {
    if (!userId) {
      setPantryItems([]); setRecipes([]); setRecipeItems([]); setLoading(false);
      return;
    }

    if (isDemo || !configured) {
      const demoPantry = getDemoPantry();
      const migrated = await migratePantryItems(demoPantry);
      setPantryItems(migrated);
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
    const migrated = await migratePantryItems(p);
    setPantryItems(migrated);
    setRecipes(r);
    setRecipeItems(ri);
    setLoading(false);
  }, [userId, isDemo, configured, migratePantryItems]);

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
          category: autoCategorize(ri.name),
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
    const category = autoCategorize(name);
    if (isDemo || !configured) {
      const existing = getDemoPantry();
      const maxOrder = Math.max(0, ...existing.filter(p => p.status === 'active').map(p => p.sortOrder ?? 0));
      const item: PantryItem = { id: genId(), userId, name, quantity, status, category, createdAt: new Date().toISOString(), sortOrder: status === 'active' ? maxOrder + 1 : 0, originalQuantity: quantity };
      const updated = [...existing, item];
      saveDemoPantry(updated);
      setPantryItems(updated);
      return;
    }
    const maxOrder = Math.max(0, ...pantryItems.filter(p => p.status === 'active').map(p => p.sortOrder ?? 0));
    const result = await addPantryItem({ userId, name, quantity, status, category, sortOrder: status === 'active' ? maxOrder + 1 : 0 });
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

  // 切换菜谱状态（激活 ↔ 已完成）
  // 新模式：只切换菜谱状态，不修改食材数量
  // 食材的剩余量由 pantryDisplayMap 实时计算，永远正确
  // 完成时记录 completedAt，撤销时清空，用于判断新食材是否应匹配历史已完成菜谱
  const toggleRecipeActive = useCallback(async (id: string) => {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;
    const newActive = recipe.active === false;
    const newCompletedAt = newActive ? undefined : new Date().toISOString();

    if (isDemo || !configured) {
      const updated = getDemoRecipes().map(r => r.id === id ? { ...r, active: newActive, completedAt: newCompletedAt } : r);
      saveDemoRecipes(updated);
      setRecipes(updated);
      return;
    }
    await updateRecipeActive(id, newActive, newCompletedAt);
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, active: newActive, completedAt: newCompletedAt } : r));
  }, [recipes, isDemo, configured]);

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

  // ===== 实时计算：食材显示信息 =====
  // 根据菜谱状态实时计算每个食材的剩余量和使用记录
  // 已完成菜谱 + 单位一致 → 从原始数量扣减
  // 已完成菜谱 + 单位不一致 → 标注"已用"
  // 活跃菜谱 → 标注"需用"，不扣减
  const pantryDisplayMap = useMemo(() => {
    const map = new Map<string, PantryDisplayInfo>();

    // 活跃食材按名称索引（取第一个匹配的）
    const activeByName = new Map<string, PantryItem>();
    for (const p of allPantryItems) {
      if (p.status === 'active' && !activeByName.has(p.name)) {
        activeByName.set(p.name, p);
      }
    }

    for (const item of allPantryItems) {
      if (item.status === 'checked') continue; // 已用完的跳过

      const isToBuy = item.status === 'to_buy';
      const originalQty = item.quantity;
      const originalParsed = parseQuantity(originalQty);

      // 找到所有匹配此食材的 recipe_items
      const matchingRIs = recipeItems.filter(ri => ri.name === item.name);

      const usages: PantryUsageInfo[] = [];
      let remainingNum = originalParsed?.numerator ?? 0;
      let remainingDen = originalParsed?.denominator ?? 1;
      let useFraction = originalParsed?.isFraction || originalParsed?.isHalf || false;
      const unit = originalParsed?.unit || '';
      let insufficient = false;

      for (const ri of matchingRIs) {
        const recipe = recipes.find(r => r.id === ri.recipeId);
        if (!recipe) continue;

        const isCompleted = recipe.active === false;
        // 时间判断：食材在菜谱完成之后才入库的，跳过
        // （新买的食材不应匹配历史已完成的菜谱）
        if (isCompleted && recipe.completedAt && item.createdAt &&
            new Date(item.createdAt) > new Date(recipe.completedAt)) {
          continue;
        }
        const recipeParsed = parseQuantity(ri.quantity);
        const unitsMatch = originalParsed && recipeParsed && originalParsed.unit === recipeParsed.unit;

        if (isCompleted && !isToBuy && unitsMatch) {
          // 已完成 + 单位一致 + 不是待买 → 扣减
          const result = subtractFraction(remainingNum, remainingDen, recipeParsed.numerator, recipeParsed.denominator);
          if (result.num < 0) insufficient = true;
          remainingNum = result.num;
          remainingDen = result.den;
          useFraction = useFraction || recipeParsed.isFraction || recipeParsed.isHalf;
          usages.push({
            recipeId: recipe.id,
            recipeTitle: recipe.title,
            quantity: ri.quantity,
            status: 'used',
            deducted: true,
          });
        } else if (isCompleted) {
          // 已完成但单位不一致（或待买项） → 标注"已用"但不扣减
          usages.push({
            recipeId: recipe.id,
            recipeTitle: recipe.title,
            quantity: ri.quantity,
            status: 'used',
            deducted: false,
          });
        } else {
          // 活跃菜谱 → 标注"需用"
          usages.push({
            recipeId: recipe.id,
            recipeTitle: recipe.title,
            quantity: ri.quantity,
            status: 'needed',
            deducted: false,
          });
        }
      }

      // 计算显示数量
      const hasDeductions = usages.some(u => u.deducted);
      let displayQuantity: string;
      if (hasDeductions && originalParsed) {
        // 有扣减 → 显示"剩X"
        if (remainingNum <= 0) {
          displayQuantity = formatRemaining(0, 1, unit, useFraction);
        } else {
          displayQuantity = formatRemaining(remainingNum, remainingDen, unit, useFraction);
        }
      } else {
        // 无扣减 → 显示原始数量
        displayQuantity = originalQty;
      }

      map.set(item.id, { displayQuantity, usages, insufficient });
    }

    return map;
  }, [allPantryItems, recipeItems, recipes]);

  const getPantryDisplay = useCallback((pantryItemId: string): PantryDisplayInfo => {
    return pantryDisplayMap.get(pantryItemId) || { displayQuantity: '', usages: [], insufficient: false };
  }, [pantryDisplayMap]);

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
    removeRecipe,
    reorderRecipes,
    createRecipeItem,
    editRecipeItem,
    removeRecipeItem,
    getPantryDisplay,
    getRecipeItemsWithMatch,
  };
}
