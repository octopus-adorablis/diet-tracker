import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  addFraction, subtractFraction, unitsMatch,
} from '../lib/quantity';
import {
  canonicalName, allocateCompletedUsage, buildVirtualToBuyItems, collectActiveNeededUsages, makeLossRecord, recomputeQuantityAfterLosses,
} from '../lib/pantry-allocation';
import type { PantryItem, Recipe, RecipeItem, RecipeItemWithMatch, PantryStatus, PantryCategory, PantryUsageInfo, PantryDisplayInfo, LossReason, PantryLoss } from '../types';

const DEMO_PANTRY_KEY = 'diet_tracker_demo_pantry';
const DEMO_RECIPES_KEY = 'diet_tracker_demo_recipes';
const DEMO_RECIPE_ITEMS_KEY = 'diet_tracker_demo_recipe_items';

function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  return url !== '' && url !== 'https://placeholder.supabase.co';
}

// ===== 食材自动分类 =====
// 根据食材名称关键词自动判断分类，按优先级匹配
// 已知容易被关键词误判的食材（含肉/海鲜/蛋等关键字但实际不属于肉类）
// 优先级最高，匹配到就直接返回正确分类
const KNOWN_OVERRIDES: Array<{ pattern: string; category: PantryCategory }> = [
  // 菌菇类——名字含"鸡/蟹"等字但实际是蔬菜
  { pattern: '鸡枞', category: 'vegetable' },
  { pattern: '鸡纵', category: 'vegetable' },
  { pattern: '蟹味菇', category: 'vegetable' },
  { pattern: '蟹味蘑菇', category: 'vegetable' },
  { pattern: '蟹菇', category: 'vegetable' },
  // 野菜/草药——名字含"鱼/猪/羊"等字
  { pattern: '鱼腥草', category: 'vegetable' },
  { pattern: '羊栖菜', category: 'vegetable' },
  { pattern: '猪毛菜', category: 'vegetable' },
  { pattern: '龙须菜', category: 'vegetable' },
  // 水果——名字含"蛋"字
  { pattern: '鸡蛋果', category: 'other' },
  // 高碳水蔬菜——普通南瓜算蔬菜，贝贝南瓜碳水高算主食
  { pattern: '贝贝南瓜', category: 'staple' },
];

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
  // 具体蔬菜名（优先匹配）——高碳水食材（土豆/玉米/藕/山药/红薯/紫薯/豌豆等）已移至主食
  '苦瓜', '黄瓜', '丝瓜', '冬瓜', '南瓜', '番茄', '西红柿', '洋葱', '白菜', '菠菜', '生菜', '油菜', '芹菜', '韭菜', '豆角', '茄子', '青椒', '辣椒', '胡萝卜', '白萝卜', '萝卜', '蘑菇', '香菇', '木耳', '豆腐', '豆芽', '菜花', '西兰花', '香菜', '蒜苗', '空心菜', '秋葵', '芦笋', '莴笋', '蒜薹', '蒜苔', '腐竹', '娃娃菜', '圆白菜', '包菜', '荠菜', '豆苗', '茼蒿', '苋菜', '莴苣',
  // 蔬菜泛称
  '菜心', '菜叶', '瓜', '茄', '葱', '蒜', '姜', '笋', '菌', '菇', '藻',
];

const STAPLE_KEYWORDS = [
  '大米', '糯米', '小米', '糙米', '燕麦', '荞麦', '藜麦', '面粉', '面条', '挂面', '意面', '面包', '馒头', '包子', '饺子', '馄饨', '饼', '年糕', '米粉', '粉丝', '米饭', '粥', '红豆', '绿豆', '黄豆', '黑豆', '花生', '芝麻', '麻油', '河粉', '通心粉', '宽粉', '红薯粉', '绿豆粉',
  // 高碳水蔬菜归主食
  '土豆', '玉米', '藕', '莲藕', '山药', '红薯', '紫薯', '豌豆',
  // 高碳水豆类
  '鹰嘴豆',
];

// 同义词归一化（canonicalName）与已完成菜谱的 FIFO 分摊逻辑
// 已抽取到 src/lib/pantry-allocation.ts，供本文件与测试共用

function autoCategorize(name: string): PantryCategory {
  const lower = name.trim();
  if (!lower) return 'other';

  // 1. 优先检查已知例外（防止关键词误判，如"黑皮鸡枞"含"鸡"但实际是菌菇）
  for (const override of KNOWN_OVERRIDES) {
    if (lower.includes(override.pattern)) return override.category;
  }

  // 2. 按优先级匹配：肉蛋奶 → 蔬菜 → 主食 → 其他
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

  // ===== Undo 系统 =====
  interface UndoEntry {
    description: string;
    action: () => Promise<void>;
  }
  const undoStackRef = useRef<UndoEntry[]>([]);
  const isUndoingRef = useRef(false);
  const [undoInfo, setUndoInfo] = useState<string | null>(null);

  const pushUndo = useCallback((description: string, action: () => Promise<void>) => {
    if (isUndoingRef.current) return;
    undoStackRef.current.push({ description, action });
    if (undoStackRef.current.length > 15) undoStackRef.current.shift();
    setUndoInfo(description);
  }, []);

  const undo = useCallback(async () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    isUndoingRef.current = true;
    try {
      await entry.action();
    } catch (e) {
      console.error('Undo failed:', e);
    } finally {
      isUndoingRef.current = false;
      const newTop = undoStackRef.current[undoStackRef.current.length - 1];
      setUndoInfo(newTop ? newTop.description : null);
    }
  }, []);

  // 全局 Cmd+Z / Ctrl+Z 监听（输入框中不拦截）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const active = document.activeElement;
        const tag = active?.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || (active as HTMLElement)?.isContentEditable) {
          return;
        }
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo]);

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
          if (recParsed && unitsMatch(recParsed.unit, currentParsed.unit)) {
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

  // ===== 实时计算：已完成菜谱用量的 FIFO 分摊 =====
  // 每份已完成菜谱的用量只扣一次：按购买时间先扣最早的批次，
  // 且只由菜谱完成前就已存在的批次承担（修复同名多批次重复扣减的 bug）
  const completedAllocations = useMemo(() => {
    return allocateCompletedUsage(pantryItems, recipeItems, recipes);
  }, [pantryItems, recipeItems, recipes]);

  // ===== 实时计算：虚拟待买项 =====
  // 菜谱食材中，未匹配到任何现有/待买食材的，自动生成虚拟待买项
  // （逻辑已抽取到 src/lib/pantry-allocation.ts 的 buildVirtualToBuyItems，便于测试）
  const virtualToBuyItems = useMemo(() => {
    return buildVirtualToBuyItems(pantryItems, recipeItems, recipes, completedAllocations, autoCategorize, userId || '');
  }, [pantryItems, recipeItems, recipes, userId, completedAllocations]);

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
      const minOrder = Math.min(0, ...existing.filter(p => p.status === 'active').map(p => p.sortOrder ?? 0));
      const item: PantryItem = { id: genId(), userId, name, quantity, status, category, createdAt: new Date().toISOString(), sortOrder: status === 'active' ? minOrder - 1 : 0, originalQuantity: quantity };
      const updated = [...existing, item];
      saveDemoPantry(updated);
      setPantryItems(updated);
      pushUndo(`添加"${name}"`, async () => {
        const all = getDemoPantry().filter(p => p.id !== item.id);
        saveDemoPantry(all);
        setPantryItems(all);
      });
      return;
    }
    const minOrder = Math.min(0, ...pantryItems.filter(p => p.status === 'active').map(p => p.sortOrder ?? 0));
    const result = await addPantryItem({ userId, name, quantity, status, category, sortOrder: status === 'active' ? minOrder - 1 : 0 });
    if (result) {
      setPantryItems(prev => [...prev, result]);
      pushUndo(`添加"${name}"`, async () => {
        await deletePantryItem(result.id);
        setPantryItems(prev => prev.filter(p => p.id !== result.id));
      });
    }
  }, [userId, isDemo, configured, pantryItems, pushUndo]);

  const editPantryItem = useCallback(async (id: string, updates: Partial<PantryItem>, lossReason?: LossReason, lossQuantity?: string) => {
    const oldItem = pantryItems.find(p => p.id === id);
    if (!oldItem) return;
    const effectiveUpdates: Partial<PantryItem> = { ...updates };
    if (lossReason && lossQuantity !== undefined && lossQuantity.trim()) {
      // ===== 损耗模式：originalQuantity（采购基数 / FIFO 扣减池）保持【不可变】 =====
      // 只把这次损耗追加进 losses，再重算 quantity = originalQuantity − 所有损耗。
      // 这样已完成的菜谱用量不会被重复扣（旧实现改写 originalQuantity 导致库存被扣到 0）。
      const newLoss = makeLossRecord(genId(), lossQuantity, oldItem.originalQuantity || oldItem.quantity, lossReason);
      const losses = [...(oldItem.losses || []), newLoss];
      effectiveUpdates.losses = losses;
      effectiveUpdates.quantity = recomputeQuantityAfterLosses({ ...oldItem, losses });
      // 关键：不覆盖 originalQuantity
    } else if (updates.quantity !== undefined) {
      // ===== 非损耗（普通修正数量 / 改名）：quantity 即用户录入的当前库存 =====
      // 同时把 originalQuantity 同步成同一值，作为后续 FIFO 的基数（"修正采购量"语义）。
      effectiveUpdates.originalQuantity = updates.quantity;
    }
    // 注意：上方损耗分支不再使用 computeLossFromEdit，因为损耗量应 = 用户录入值，
    // 而非 (originalQuantity − 剩余量)，后者会把 FIFO 已扣量也记成损耗。
    const oldValues = Object.fromEntries(
      Object.keys(effectiveUpdates).map(k => [k, (oldItem as unknown as Record<string, unknown>)[k]])
    ) as Partial<PantryItem>;
    if (isDemo || !configured) {
      const updated = getDemoPantry().map(p => p.id === id ? { ...p, ...effectiveUpdates } : p);
      saveDemoPantry(updated);
      setPantryItems(updated);
      pushUndo(`编辑"${oldItem.name}"`, async () => {
        const all = getDemoPantry().map(p => p.id === id ? { ...p, ...oldValues } : p);
        saveDemoPantry(all);
        setPantryItems(all);
      });
      return;
    }
    await updatePantryItem(id, effectiveUpdates);
    setPantryItems(prev => prev.map(p => p.id === id ? { ...p, ...effectiveUpdates } : p));
    pushUndo(`编辑"${oldItem.name}"`, async () => {
      await updatePantryItem(id, oldValues);
      setPantryItems(prev => prev.map(p => p.id === id ? { ...p, ...oldValues } : p));
    });
  }, [pantryItems, isDemo, configured, pushUndo]);

  // 删除单条损耗记录：从 losses 移除该条，库存加回（重算 quantity），
  // originalQuantity（采购基数）保持不变，避免再次污染 FIFO 扣减池。
  // 支持撤销（撤销 = 重新写回这条损耗记录 + 扣回该量）。
  const removePantryLoss = useCallback(async (id: string, lossId: string) => {
    const oldItem = pantryItems.find(p => p.id === id);
    if (!oldItem) return;
    const losses = (oldItem.losses || []).filter(l => l.id !== lossId);

    const effectiveUpdates: Partial<PantryItem> = {
      quantity: recomputeQuantityAfterLosses({ ...oldItem, losses }),
      losses,
      // originalQuantity 保持不变
    };
    const oldValues = {
      quantity: oldItem.quantity,
      originalQuantity: oldItem.originalQuantity,
      losses: oldItem.losses || [],
    };

    const apply = async (values: Partial<PantryItem>) => {
      if (isDemo || !configured) {
        const updated = getDemoPantry().map(p => p.id === id ? { ...p, ...values } : p);
        saveDemoPantry(updated);
        setPantryItems(updated);
      } else {
        await updatePantryItem(id, values);
        setPantryItems(prev => prev.map(p => p.id === id ? { ...p, ...values } : p));
      }
    };

    await apply(effectiveUpdates);
    pushUndo('删除损耗记录', async () => {
      await apply(oldValues);
    });
  }, [pantryItems, isDemo, configured, pushUndo]);

  const removePantryItem = useCallback(async (id: string) => {
    const item = pantryItems.find(p => p.id === id);
    if (!item) return;
    if (isDemo || !configured) {
      const updated = getDemoPantry().filter(p => p.id !== id);
      saveDemoPantry(updated);
      setPantryItems(updated);
      pushUndo(`删除"${item.name}"`, async () => {
        const all = getDemoPantry();
        if (!all.find(p => p.id === id)) {
          const restored = [...all, item];
          saveDemoPantry(restored);
          setPantryItems(restored);
        }
      });
      return;
    }
    await deletePantryItem(id);
    setPantryItems(prev => prev.filter(p => p.id !== id));
    pushUndo(`删除"${item.name}"`, async () => {
      const result = await addPantryItem({
        userId: item.userId, name: item.name, quantity: item.quantity,
        status: item.status, category: item.category, sortOrder: item.sortOrder ?? 0,
      });
      if (result) setPantryItems(prev => [...prev, result]);
    });
  }, [pantryItems, isDemo, configured, pushUndo]);

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
    const oldOrderMap = new Map(activeList.map((item, idx) => [item.id, idx]));

    // 乐观更新内存
    setPantryItems(prev => prev.map(p =>
      orderMap.has(p.id) ? { ...p, sortOrder: orderMap.get(p.id) } : p
    ));

    if (isDemo || !configured) {
      const all = getDemoPantry().map(p =>
        orderMap.has(p.id) ? { ...p, sortOrder: orderMap.get(p.id) } : p
      );
      saveDemoPantry(all);
      pushUndo('移动食材', async () => {
        const restored = getDemoPantry().map(p =>
          oldOrderMap.has(p.id) ? { ...p, sortOrder: oldOrderMap.get(p.id) } : p
        );
        saveDemoPantry(restored);
        setPantryItems(restored);
      });
      return;
    }

    await updatePantrySortOrders(updates);
    pushUndo('移动食材', async () => {
      const oldUpdates = activeList.map((item, idx) => ({ id: item.id, sortOrder: idx }));
      await updatePantrySortOrders(oldUpdates);
      setPantryItems(prev => prev.map(p =>
        oldOrderMap.has(p.id) ? { ...p, sortOrder: oldOrderMap.get(p.id) } : p
      ));
    });
  }, [isDemo, configured, pushUndo]);

  // 批量重排：接受一个新的顺序数组，更新所有 sortOrder
  const reorderPantryItemsBatch = useCallback(async (newOrder: PantryItem[]) => {
    const updates = newOrder.map((item, idx) => ({ id: item.id, sortOrder: idx }));
    const orderMap = new Map(updates.map(u => [u.id, u.sortOrder]));
    const oldOrderMap = new Map(newOrder.map((item, idx) => [item.id, item.sortOrder ?? idx]));

    // 乐观更新内存
    setPantryItems(prev => prev.map(p =>
      orderMap.has(p.id) ? { ...p, sortOrder: orderMap.get(p.id) } : p
    ));

    if (isDemo || !configured) {
      const all = getDemoPantry().map(p =>
        orderMap.has(p.id) ? { ...p, sortOrder: orderMap.get(p.id) } : p
      );
      saveDemoPantry(all);
      pushUndo('移动食材', async () => {
        const restored = getDemoPantry().map(p =>
          oldOrderMap.has(p.id) ? { ...p, sortOrder: oldOrderMap.get(p.id) } : p
        );
        saveDemoPantry(restored);
        setPantryItems(restored);
      });
      return;
    }

    await updatePantrySortOrders(updates);
    pushUndo('移动食材', async () => {
      const oldUpdates = newOrder.map((item, idx) => ({ id: item.id, sortOrder: item.sortOrder ?? idx }));
      await updatePantrySortOrders(oldUpdates);
      setPantryItems(prev => prev.map(p =>
        oldOrderMap.has(p.id) ? { ...p, sortOrder: oldOrderMap.get(p.id) } : p
      ));
    });
  }, [isDemo, configured, pushUndo]);

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
    // 保存旧值用于 undo
    const oldValuesMap = new Map<string, { category: PantryCategory; sortOrder: number }>();
    for (const id of realIds) {
      const item = pantryItems.find(p => p.id === id);
      if (item) oldValuesMap.set(id, { category: item.category, sortOrder: item.sortOrder ?? 0 });
    }
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
      pushUndo('修改分类', async () => {
        const restored = getDemoPantry().map(p =>
          oldValuesMap.has(p.id) ? { ...p, ...oldValuesMap.get(p.id) } : p
        );
        saveDemoPantry(restored);
        setPantryItems(restored);
      });
      return;
    }
    await Promise.all(
      realIds.map((id, idx) => updatePantryItem(id, { category, sortOrder: maxOrder + 1 + idx }))
    );
    pushUndo('修改分类', async () => {
      await Promise.all(
        realIds.map(id => {
          const old = oldValuesMap.get(id);
          return old ? updatePantryItem(id, old) : Promise.resolve();
        })
      );
      setPantryItems(prev => prev.map(p =>
        oldValuesMap.has(p.id) ? { ...p, ...oldValuesMap.get(p.id) } : p
      ));
    });
  }, [pantryItems, isDemo, configured, pushUndo]);

  // ===== 菜谱 CRUD =====

  const createRecipe = useCallback(async (title: string): Promise<Recipe | null> => {
    if (!userId) return null;
    if (isDemo || !configured) {
      const minOrder = Math.min(0, ...getDemoRecipes().map(r => r.sortOrder ?? 0));
      const recipe: Recipe = { id: genId(), userId, title, createdAt: new Date().toISOString(), active: true, sortOrder: minOrder - 1 };
      const updated = [recipe, ...getDemoRecipes()];
      saveDemoRecipes(updated);
      setRecipes(updated);
      pushUndo(`添加菜谱"${title}"`, async () => {
        const all = getDemoRecipes().filter(r => r.id !== recipe.id);
        saveDemoRecipes(all);
        setRecipes(all);
      });
      return recipe;
    }
    const minOrder = Math.min(0, ...recipes.map(r => r.sortOrder ?? 0));
    const result = await addRecipe({ userId, title, sortOrder: minOrder - 1 });
    if (result) {
      setRecipes(prev => [result, ...prev]);
      pushUndo(`添加菜谱"${title}"`, async () => {
        await deleteRecipe(result.id);
        setRecipes(prev => prev.filter(r => r.id !== result.id));
      });
    }
    return result;
  }, [userId, isDemo, configured, recipes, pushUndo]);

  const editRecipeTitle = useCallback(async (id: string, title: string) => {
    const oldRecipe = recipes.find(r => r.id === id);
    const oldTitle = oldRecipe?.title || '';
    if (isDemo || !configured) {
      const updated = getDemoRecipes().map(r => r.id === id ? { ...r, title } : r);
      saveDemoRecipes(updated);
      setRecipes(updated);
      pushUndo('编辑菜谱名', async () => {
        const all = getDemoRecipes().map(r => r.id === id ? { ...r, title: oldTitle } : r);
        saveDemoRecipes(all);
        setRecipes(all);
      });
      return;
    }
    await updateRecipe(id, title);
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, title } : r));
    pushUndo('编辑菜谱名', async () => {
      await updateRecipe(id, oldTitle);
      setRecipes(prev => prev.map(r => r.id === id ? { ...r, title: oldTitle } : r));
    });
  }, [recipes, isDemo, configured, pushUndo]);

  // 切换菜谱状态（激活 ↔ 已完成）
  // 新模式：只切换菜谱状态，不修改食材数量
  // 食材的剩余量由 pantryDisplayMap 实时计算，永远正确
  // 完成时记录 completedAt，撤销时清空，用于判断新食材是否应匹配历史已完成菜谱
  const toggleRecipeActive = useCallback(async (id: string) => {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;
    const newActive = recipe.active === false;
    const newCompletedAt = newActive ? undefined : new Date().toISOString();
    const oldActive = recipe.active;
    const oldCompletedAt = recipe.completedAt;

    if (isDemo || !configured) {
      const updated = getDemoRecipes().map(r => r.id === id ? { ...r, active: newActive, completedAt: newCompletedAt } : r);
      saveDemoRecipes(updated);
      setRecipes(updated);
      pushUndo(newActive ? '撤销完成菜谱' : '完成菜谱', async () => {
        const all = getDemoRecipes().map(r => r.id === id ? { ...r, active: oldActive, completedAt: oldCompletedAt } : r);
        saveDemoRecipes(all);
        setRecipes(all);
      });
      return;
    }
    await updateRecipeActive(id, newActive, newCompletedAt);
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, active: newActive, completedAt: newCompletedAt } : r));
    pushUndo(newActive ? '撤销完成菜谱' : '完成菜谱', async () => {
      await updateRecipeActive(id, oldActive ?? true, oldCompletedAt);
      setRecipes(prev => prev.map(r => r.id === id ? { ...r, active: oldActive, completedAt: oldCompletedAt } : r));
    });
  }, [recipes, isDemo, configured, pushUndo]);

  // "再做"：基于已完成菜谱生成一份全新的活跃菜谱（同名+同食材清单），原菜谱保留
  const redoRecipe = useCallback(async (id: string): Promise<Recipe | null> => {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return null;
    const sourceItems = recipeItems.filter(ri => ri.recipeId === id);

    if (isDemo || !configured) {
      const minOrder = Math.min(0, ...getDemoRecipes().map(r => r.sortOrder ?? 0));
      const newRecipe: Recipe = { id: genId(), userId: recipe.userId, title: recipe.title, createdAt: new Date().toISOString(), active: true, sortOrder: minOrder - 1 };
      const newItems: RecipeItem[] = sourceItems.map(ri => ({ id: genId(), recipeId: newRecipe.id, name: ri.name, quantity: ri.quantity }));
      const updatedRecipes = [newRecipe, ...getDemoRecipes()];
      const updatedItems = [...getDemoRecipeItems(), ...newItems];
      saveDemoRecipes(updatedRecipes);
      saveDemoRecipeItems(updatedItems);
      setRecipes(updatedRecipes);
      setRecipeItems(updatedItems);
      pushUndo(`再做"${recipe.title}"`, async () => {
        const allR = getDemoRecipes().filter(r => r.id !== newRecipe.id);
        const allI = getDemoRecipeItems().filter(ri => ri.recipeId !== newRecipe.id);
        saveDemoRecipes(allR);
        saveDemoRecipeItems(allI);
        setRecipes(allR);
        setRecipeItems(allI);
      });
      return newRecipe;
    }

    const minOrder = Math.min(0, ...recipes.map(r => r.sortOrder ?? 0));
    const newRecipe = await addRecipe({ userId: recipe.userId, title: recipe.title, sortOrder: minOrder - 1 });
    if (!newRecipe) return null;
    setRecipes(prev => [newRecipe, ...prev]);
    const newItems: RecipeItem[] = [];
    for (const ri of sourceItems) {
      const created = await addRecipeItem({ recipeId: newRecipe.id, name: ri.name, quantity: ri.quantity });
      if (created) newItems.push(created);
    }
    setRecipeItems(prev => [...prev, ...newItems]);
    pushUndo(`再做"${recipe.title}"`, async () => {
      await deleteRecipe(newRecipe.id); // recipe_items 级联删除
      setRecipes(prev => prev.filter(r => r.id !== newRecipe.id));
      setRecipeItems(prev => prev.filter(ri => ri.recipeId !== newRecipe.id));
    });
    return newRecipe;
  }, [recipes, recipeItems, isDemo, configured, pushUndo]);

  const removeRecipe = useCallback(async (id: string) => {
    const recipe = recipes.find(r => r.id === id);
    const childItems = recipeItems.filter(ri => ri.recipeId === id);
    if (isDemo || !configured) {
      saveDemoRecipes(getDemoRecipes().filter(r => r.id !== id));
      saveDemoRecipeItems(getDemoRecipeItems().filter(ri => ri.recipeId !== id));
      setRecipes(getDemoRecipes());
      setRecipeItems(getDemoRecipeItems());
      if (recipe) {
        pushUndo(`删除菜谱"${recipe.title}"`, async () => {
          const allR = getDemoRecipes();
          if (!allR.find(r => r.id === id)) {
            saveDemoRecipes([...allR, recipe]);
            saveDemoRecipeItems([...getDemoRecipeItems(), ...childItems]);
            setRecipes([...allR, recipe]);
            setRecipeItems([...getDemoRecipeItems(), ...childItems]);
          }
        });
      }
      return;
    }
    await deleteRecipe(id);
    setRecipes(prev => prev.filter(r => r.id !== id));
    setRecipeItems(prev => prev.filter(ri => ri.recipeId !== id));
    if (recipe) {
      pushUndo(`删除菜谱"${recipe.title}"`, async () => {
        const result = await addRecipe({ userId: recipe.userId, title: recipe.title, sortOrder: recipe.sortOrder ?? 0 });
        if (result) {
          setRecipes(prev => [...prev, result]);
          for (const ci of childItems) {
            const ri = await addRecipeItem({ recipeId: result.id, name: ci.name, quantity: ci.quantity });
            if (ri) setRecipeItems(prev => [...prev, ri]);
          }
        }
      });
    }
  }, [recipes, recipeItems, isDemo, configured, pushUndo]);

  // 拖拽排序：重新排列菜谱
  const reorderRecipes = useCallback(async (activeList: Recipe[], oldIndex: number, newIndex: number) => {
    const reordered = arrayMove(activeList, oldIndex, newIndex);
    const updates = reordered.map((item, idx) => ({ id: item.id, sortOrder: idx }));
    const oldUpdates = activeList.map((item, idx) => ({ id: item.id, sortOrder: idx }));

    // 乐观更新内存（用重排后的数组替换，不仅仅是更新 sortOrder 字段）
    setRecipes(reordered.map((r, idx) => ({ ...r, sortOrder: idx })));

    if (isDemo || !configured) {
      saveDemoRecipes(reordered.map((r, idx) => ({ ...r, sortOrder: idx })));
      pushUndo('移动菜谱', async () => {
        const restored = activeList.map((r, idx) => ({ ...r, sortOrder: idx }));
        saveDemoRecipes(restored);
        setRecipes(restored);
      });
      return;
    }

    await updateRecipeSortOrders(updates);
    pushUndo('移动菜谱', async () => {
      await updateRecipeSortOrders(oldUpdates);
      setRecipes(activeList.map((r, idx) => ({ ...r, sortOrder: idx })));
    });
  }, [isDemo, configured, pushUndo]);

  // ===== 菜谱食材 CRUD =====

  const createRecipeItem = useCallback(async (recipeId: string, name: string, quantity: string) => {
    if (isDemo || !configured) {
      const item: RecipeItem = { id: genId(), recipeId, name, quantity };
      const updated = [...getDemoRecipeItems(), item];
      saveDemoRecipeItems(updated);
      setRecipeItems(updated);
      pushUndo(`添加菜谱食材"${name}"`, async () => {
        const all = getDemoRecipeItems().filter(ri => ri.id !== item.id);
        saveDemoRecipeItems(all);
        setRecipeItems(all);
      });
      return;
    }
    const result = await addRecipeItem({ recipeId, name, quantity });
    if (result) {
      setRecipeItems(prev => [...prev, result]);
      pushUndo(`添加菜谱食材"${name}"`, async () => {
        await deleteRecipeItem(result.id);
        setRecipeItems(prev => prev.filter(ri => ri.id !== result.id));
      });
    }
  }, [isDemo, configured, pushUndo]);

  const editRecipeItem = useCallback(async (id: string, updates: Partial<RecipeItem>) => {
    const oldItem = recipeItems.find(ri => ri.id === id);
    if (!oldItem) return;
    const oldValues = Object.fromEntries(
      Object.keys(updates).map(k => [k, (oldItem as unknown as Record<string, unknown>)[k]])
    ) as Partial<RecipeItem>;
    if (isDemo || !configured) {
      const updated = getDemoRecipeItems().map(ri => ri.id === id ? { ...ri, ...updates } : ri);
      saveDemoRecipeItems(updated);
      setRecipeItems(updated);
      pushUndo('编辑菜谱食材', async () => {
        const all = getDemoRecipeItems().map(ri => ri.id === id ? { ...ri, ...oldValues } : ri);
        saveDemoRecipeItems(all);
        setRecipeItems(all);
      });
      return;
    }
    await updateRecipeItem(id, updates);
    setRecipeItems(prev => prev.map(ri => ri.id === id ? { ...ri, ...updates } : ri));
    pushUndo('编辑菜谱食材', async () => {
      await updateRecipeItem(id, oldValues);
      setRecipeItems(prev => prev.map(ri => ri.id === id ? { ...ri, ...oldValues } : ri));
    });
  }, [recipeItems, isDemo, configured, pushUndo]);

  const removeRecipeItem = useCallback(async (id: string) => {
    const item = recipeItems.find(ri => ri.id === id);
    if (!item) return;
    if (isDemo || !configured) {
      const updated = getDemoRecipeItems().filter(ri => ri.id !== id);
      saveDemoRecipeItems(updated);
      setRecipeItems(updated);
      pushUndo(`删除菜谱食材"${item.name}"`, async () => {
        const all = getDemoRecipeItems();
        if (!all.find(ri => ri.id === id)) {
          const restored = [...all, item];
          saveDemoRecipeItems(restored);
          setRecipeItems(restored);
        }
      });
      return;
    }
    await deleteRecipeItem(id);
    setRecipeItems(prev => prev.filter(ri => ri.id !== id));
    pushUndo(`删除菜谱食材"${item.name}"`, async () => {
      const result = await addRecipeItem({ recipeId: item.recipeId, name: item.name, quantity: item.quantity });
      if (result) setRecipeItems(prev => [...prev, result]);
    });
  }, [recipeItems, isDemo, configured, pushUndo]);

  // ===== 实时计算：食材显示信息 =====
  // 根据菜谱状态实时计算每个食材的剩余量和使用记录
  // 已完成菜谱：用量按 FIFO 分摊到同名各批次，每份用量只扣一次（见 pantry-allocation.ts）
  // 已完成菜谱 + 单位不一致 → 标注"已用"
  // 活跃菜谱 → 标注"需用"，不扣减
  const pantryDisplayMap = useMemo(() => {
    const map = new Map<string, PantryDisplayInfo>();
    const { deductions: allocDeductions, allocatedRecipeItemIds, insufficientIds } = completedAllocations;

    // 预计算：哪些活跃菜谱食材已被真实活跃食材"覆盖"（虚拟扣减后够用）
    // 用于虚拟待买项（virtual-shortfall-*）只显示未被覆盖的菜谱
    // 场景：食材120g，菜谱A需120g + 菜谱B需120g → 菜谱A被覆盖，待买项只显示菜谱B
    const coveredRecipeItemIds = new Set<string>();
    for (const item of allPantryItems) {
      if (item.status !== 'active' || item.id.startsWith('virtual-')) continue;
      const origParsed = parseQuantity(item.originalQuantity || item.quantity);
      if (!origParsed) continue;

      // FIFO 分摊后该批次的剩余量
      let remNum = origParsed.numerator;
      let remDen = origParsed.denominator;
      const alloc = allocDeductions.get(item.id);
      if (alloc) {
        const r = subtractFraction(remNum, remDen, alloc.num, alloc.den);
        remNum = r.num;
        remDen = r.den;
      }

      // 再虚拟扣减活跃菜谱，标记"覆盖"的 recipe item
      let actRemNum = remNum;
      let actRemDen = remDen;
      const itemMatchingRIs = recipeItems.filter(ri => canonicalName(ri.name) === canonicalName(item.name));
      for (const ri of itemMatchingRIs) {
        if (coveredRecipeItemIds.has(ri.id)) continue; // 已被其他食材覆盖
        const recipe = recipes.find(r => r.id === ri.recipeId);
        if (!recipe || recipe.active === false) continue;
        const rp = parseQuantity(ri.quantity);
        if (!rp || !unitsMatch(origParsed.unit, rp.unit)) continue;
        const r = subtractFraction(actRemNum, actRemDen, rp.numerator, rp.denominator);
        if (r.num >= 0) {
          coveredRecipeItemIds.add(ri.id);
          actRemNum = r.num;
          actRemDen = r.den;
        }
      }
    }

    for (const item of allPantryItems) {
      if (item.status === 'checked') continue; // 已用完的跳过

      const isToBuy = item.status === 'to_buy';
      const originalQty = item.originalQuantity || item.quantity;
      const originalParsed = parseQuantity(originalQty);

      // 找到所有匹配此食材的 recipe_items
      const matchingRIs = recipeItems.filter(ri => canonicalName(ri.name) === canonicalName(item.name));

      const usages: PantryUsageInfo[] = [];
      let remainingNum = originalParsed?.numerator ?? 0;
      let remainingDen = originalParsed?.denominator ?? 1;
      let useFraction = originalParsed?.isFraction || originalParsed?.isHalf || false;
      const unit = originalParsed?.unit || '';
      let insufficient = false;

      // 先减去所有损耗（损耗只影响当前库存，不进入 FIFO 扣减池）
      const itemLosses = item.losses || [];
      for (const l of itemLosses) {
        const lp = parseQuantity(l.quantity);
        if (!lp || !originalParsed || !unitsMatch(lp.unit, originalParsed.unit)) continue;
        const r = subtractFraction(remainingNum, remainingDen, lp.numerator, lp.denominator);
        remainingNum = r.num;
        remainingDen = r.den;
        useFraction = useFraction || lp.isFraction || lp.isHalf;
      }

      // 已完成菜谱用量的 FIFO 分摊扣减：该批次实际承担的量（每份用量只扣一次）
      const allocDeduct = allocDeductions.get(item.id);
      if (allocDeduct) {
        const result = subtractFraction(remainingNum, remainingDen, allocDeduct.num, allocDeduct.den);
        remainingNum = result.num;
        remainingDen = result.den;
        if (insufficientIds.has(item.id)) insufficient = true;
      }

      for (const ri of matchingRIs) {
        const recipe = recipes.find(r => r.id === ri.recipeId);
        if (!recipe) continue;

        const isCompleted = recipe.active === false;

        // 虚拟待买项（数量不足自动生成的）跳过已被真实食材覆盖的菜谱
        // 只显示"不够买"的那部分菜谱，避免与真实食材的标注重复
        if (isToBuy && item.id.startsWith('virtual-shortfall-') && coveredRecipeItemIds.has(ri.id)) {
          continue;
        }

        // 待买项不显示已完成菜谱的使用记录（那些记录属于已用完的旧食材）
        if (isCompleted && isToBuy) continue;

        const recipeParsed = parseQuantity(ri.quantity);
        const isUnitsMatch = originalParsed && recipeParsed && unitsMatch(originalParsed.unit, recipeParsed.unit);

        if (isCompleted) {
          // 已完成菜谱：只有 FIFO 分摊到该批次上的用量才显示并计入扣减
          const allocated = !isToBuy && allocatedRecipeItemIds.get(item.id)?.has(ri.id);
          if (allocated && recipeParsed) {
            // 该批次实际承担了这次扣减（量已在上面统一减去）
            useFraction = useFraction || recipeParsed.isFraction || recipeParsed.isHalf;
            usages.push({
              recipeId: recipe.id,
              recipeTitle: recipe.title,
              quantity: ri.quantity,
              status: 'used',
              deducted: true,
            });
          } else if (!isUnitsMatch) {
            // 已完成但单位不一致 → 标注"已用"但不扣减
            usages.push({
              recipeId: recipe.id,
              recipeTitle: recipe.title,
              quantity: ri.quantity,
              status: 'used',
              deducted: false,
            });
          }
          // 单位一致但用量分摊给了更早的批次 → 不在此批次重复显示，避免重复扣减的错觉
        }
      }

      // 活跃菜谱的"需用"需求统一收集（避免做菜页与食材详情页不一致）
      if (!isToBuy) {
        const { usages: activeUsages, insufficient: activeInsufficient } = collectActiveNeededUsages(item, matchingRIs, recipes, originalParsed);
        for (const u of activeUsages) {
          usages.push({ ...u, status: 'needed', deducted: false });
        }
        if (activeInsufficient) insufficient = true;
      }

      // 计算显示数量
      const hasDeductions = usages.some(u => u.deducted) || itemLosses.length > 0;
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
  }, [allPantryItems, recipeItems, recipes, completedAllocations]);

  const getPantryDisplay = useCallback((pantryItemId: string): PantryDisplayInfo => {
    return pantryDisplayMap.get(pantryItemId) || { displayQuantity: '', usages: [], insufficient: false };
  }, [pantryDisplayMap]);

  // ===== 实时计算：菜谱食材匹配状态 =====
  const recipeItemMatches = useMemo(() => {
    // 同义词归一化：番茄/西红柿、圣女果/小番茄 视为同一食材（见 canonicalName）
    const activeNames = new Set(
      pantryItems.filter(p => p.status === 'active').map(p => canonicalName(p.name))
    );

    return recipeItems.map(ri => {
      const matched = activeNames.has(canonicalName(ri.name));
      const matchedPantryItem = pantryItems.find(p => p.status === 'active' && canonicalName(p.name) === canonicalName(ri.name));
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
    removePantryLoss,
    removePantryItem,
    toggleChecked,
    convertToBuyToActive,
    reorderPantryItems,
    reorderPantryItemsBatch,
    setPantryCategory,
    setPantryCategoryBatch,
    createRecipe,
    editRecipeTitle,
    toggleRecipeActive,
    redoRecipe,
    removeRecipe,
    reorderRecipes,
    createRecipeItem,
    editRecipeItem,
    removeRecipeItem,
    getPantryDisplay,
    getRecipeItemsWithMatch,
    undoInfo,
    undo,
  };
}
