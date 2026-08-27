import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Circle, CheckCircle, X, Check, ChefHat, ShoppingCart, ExternalLink, LayoutGrid, List, Beef, Carrot, Wheat, Package, Undo2, AlertTriangle, Pencil } from 'lucide-react';
import {
  DndContext, closestCenter, pointerWithin, PointerSensor, useSensor, useSensors, useDroppable, DragOverlay,
  type DragEndEvent, type DragStartEvent, type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PantryItem, PantryDisplayInfo, PantryUsageInfo, PantryStatus, PantryCategory, LossReason, PantryLoss } from '../types';
import { LOSS_REASON_LABELS } from '../types';
import { quantitySubtract, parseQuantity, subtractFraction, unitsMatch } from '../lib/quantity';
import SwipeToDelete from './SwipeToDelete';

// 四象限配置
const QUADRANTS: { id: PantryCategory; label: string; icon: typeof Beef }[] = [
  { id: 'meat_dairy', label: '肉类&乳制品', icon: Beef },
  { id: 'vegetable', label: '蔬菜', icon: Carrot },
  { id: 'staple', label: '主食', icon: Wheat },
  { id: 'other', label: '其他', icon: Package },
];

// 各象限配色（静态类名，避免 Tailwind purge）
const QUADRANT_STYLES: Record<PantryCategory, { dot: string; icon: string; label: string; zone: string; zoneOver: string }> = {
  meat_dairy: { dot: 'bg-terra-400', icon: 'text-terra-500', label: 'text-terra-600', zone: 'bg-terra-50/60', zoneOver: 'border-terra-400 bg-terra-100 ring-4 ring-terra-300/40' },
  vegetable: { dot: 'bg-ocean-400', icon: 'text-ocean-500', label: 'text-ocean-600', zone: 'bg-ocean-50/60', zoneOver: 'border-ocean-400 bg-ocean-100 ring-4 ring-ocean-300/40' },
  staple: { dot: 'bg-gold-400', icon: 'text-gold-500', label: 'text-gold-500', zone: 'bg-gold-50/60', zoneOver: 'border-gold-400 bg-gold-100 ring-4 ring-gold-300/40' },
  other: { dot: 'bg-grape-400', icon: 'text-grape-500', label: 'text-grape-600', zone: 'bg-grape-50/60', zoneOver: 'border-grape-400 bg-grape-100 ring-4 ring-grape-300/40' },
};

interface PantryViewProps {
  pantryItems: PantryItem[];
  getPantryDisplay: (id: string) => PantryDisplayInfo;
  onCreatePantryItem: (name: string, quantity: string, status: PantryStatus) => Promise<void>;
  onEditPantryItem: (id: string, updates: { name?: string; quantity?: string }, lossReason?: LossReason) => Promise<void>;
  onToggleChecked: (id: string) => Promise<void>;
  onConvertToBuy: (id: string, quantity: string) => Promise<void>;
  onDeletePantryItem: (id: string) => Promise<void>;
  onDeleteLoss: (id: string, lossId: string) => Promise<void>;
  onReorder: (activeList: PantryItem[], oldIndex: number, newIndex: number) => Promise<void>;
  onReorderBatch: (newOrder: PantryItem[]) => Promise<void>;
  onSetCategory: (id: string, category: PantryCategory) => Promise<void>;
  onSetCategoryBatch: (ids: string[], category: PantryCategory) => Promise<void>;
  onNavigateToRecipe: (recipeId: string) => void;
  onNavigateToCooking: () => void;
  onOpenCookingInNewTab: () => void;
  undoInfo?: string | null;
  onUndo: () => void;
}

export default function PantryView({
  pantryItems, getPantryDisplay, onCreatePantryItem, onEditPantryItem, onToggleChecked, onConvertToBuy,
  onDeletePantryItem, onDeleteLoss, onReorder, onReorderBatch, onSetCategory, onSetCategoryBatch,   onNavigateToRecipe, onNavigateToCooking, onOpenCookingInNewTab, undoInfo, onUndo,
}: PantryViewProps) {
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [showChecked, setShowChecked] = useState(false);
  const [buyDialogItem, setBuyDialogItem] = useState<PantryItem | null>(null);
  const [buyQty, setBuyQty] = useState('');
  const [layoutMode, setLayoutMode] = useState<'list' | 'quadrant'>(() => {
    return (localStorage.getItem('diet_tracker_pantry_layout') as 'list' | 'quadrant') || 'list';
  });
  // 拖拽视觉：当前拖动的 id（DragOverlay）
  const [activeId, setActiveId] = useState<string | null>(null);
  // 批量选择
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 拖拽守卫：防止拖拽松手误触发点击选中
  const dragGuardRef = useRef(false);

  const activeItems = pantryItems.filter(p => p.status === 'active');
  const toBuyItems = pantryItems.filter(p => p.status === 'to_buy');
  const checkedItems = pantryItems.filter(p => p.status === 'checked');

  // 四象限：按分类分组，组内按 sortOrder 排序
  const itemsByCategory = useMemo(() => {
    const map: Record<PantryCategory, PantryItem[]> = {
      meat_dairy: [], vegetable: [], staple: [], other: [],
    };
    for (const item of activeItems) {
      const cat = (item.category || 'other') as PantryCategory;
      map[cat].push(item);
    }
    for (const cat of Object.keys(map) as PantryCategory[]) {
      map[cat].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return map;
  }, [activeItems]);

  // 长按 250ms 激活拖拽；手指快速移动（>8px）则取消，让浏览器滚动
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    })
  );

  // 四象限碰撞检测：优先用指针所在区域(pointerWithin)精确命中，
  // 指针不在任何区域时 fallback 到 closestCenter，解决跨象限拖拽误判
  const quadrantCollision: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return closestCenter(args);
  };

  const toggleLayout = () => {
    const next = layoutMode === 'list' ? 'quadrant' : 'list';
    setLayoutMode(next);
    localStorage.setItem('diet_tracker_pantry_layout', next);
    // 切换布局时退出批量选择
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    if (dragGuardRef.current) { dragGuardRef.current = false; return; }
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleDragStart = (e: DragStartEvent) => {
    dragGuardRef.current = true;
    setActiveId(String(e.active.id));
  };

  // 列表模式拖拽：排序
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    dragGuardRef.current = true;
    setTimeout(() => { dragGuardRef.current = false; }, 80);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeItems.findIndex(i => i.id === active.id);
    const newIndex = activeItems.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(activeItems, oldIndex, newIndex);
  };

  // 四象限模式拖拽：跨象限=改分类，同象限=排序；批量选择时整批改分类
  const handleQuadrantDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    dragGuardRef.current = true;
    setTimeout(() => { dragGuardRef.current = false; }, 80);
    const { active, over } = event;
    if (!over) return;
    const activeItem = activeItems.find(i => i.id === active.id);
    if (!activeItem) return;

    const overId = String(over.id);

    // 确定目标分类
    let targetCategory: PantryCategory;
    if (overId.startsWith('quad-')) {
      targetCategory = overId.replace('quad-', '') as PantryCategory;
    } else {
      const overItem = activeItems.find(i => i.id === over.id);
      if (!overItem || overItem.id === activeItem.id) return;
      targetCategory = (overItem.category || 'other') as PantryCategory;
    }

    const activeCat = (activeItem.category || 'other') as PantryCategory;
    const activeIdStr = String(active.id);

    // 批量选择且当前拖动项被选中 → 整批改分类（仅跨象限时）
    if (selectionMode && selectedIds.has(activeIdStr) && selectedIds.size > 0) {
      if (activeCat !== targetCategory) {
        onSetCategoryBatch(Array.from(selectedIds), targetCategory);
      }
      // 拖到同象限上的其他项 → 批量排序
      if (activeCat === targetCategory && !overId.startsWith('quad-')) {
        const catItems = itemsByCategory[activeCat];
        const overIdx = catItems.findIndex(i => i.id === over.id);
        const activeIdx = catItems.findIndex(i => i.id === active.id);
        if (overIdx !== -1 && activeIdx !== -1 && overIdx !== activeIdx) {
          if (selectedIds.size > 1) {
            // 多选：把所有选中项移到目标位置，保持相对顺序
            const selected = catItems.filter(i => selectedIds.has(i.id));
            const unselected = catItems.filter(i => !selectedIds.has(i.id));
            let insertAt = unselected.findIndex(i => i.id === over.id);
            if (insertAt === -1) insertAt = unselected.length;
            // 向下拖时插到目标项后面
            if (activeIdx < overIdx) insertAt = Math.min(insertAt + 1, unselected.length);
            const newOrder = [
              ...unselected.slice(0, insertAt),
              ...selected,
              ...unselected.slice(insertAt),
            ];
            onReorderBatch(newOrder);
          } else {
            onReorder(catItems, activeIdx, overIdx);
          }
        }
      }
      exitSelectionMode();
      return;
    }

    // 单个：拖到象限空白区或跨象限食材 → 改分类
    if (activeCat !== targetCategory) {
      onSetCategory(activeIdStr, targetCategory);
      return;
    }

    // 同象限 → 排序
    if (!overId.startsWith('quad-')) {
      const catItems = itemsByCategory[activeCat];
      const oldIndex = catItems.findIndex(i => i.id === active.id);
      const newIndex = catItems.findIndex(i => i.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        onReorder(catItems, oldIndex, newIndex);
      }
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await onCreatePantryItem(newName.trim(), newQty.trim(), 'active');
      setNewName('');
      setNewQty('');
    } catch (e) {
      alert(e instanceof Error ? e.message : '添加失败，请重试');
    }
  };

  const handleBuyClick = (item: PantryItem) => {
    setBuyDialogItem(item);
    setBuyQty(item.quantity);
  };

  const handleBuyConfirm = async () => {
    if (!buyDialogItem) return;
    await onConvertToBuy(buyDialogItem.id, buyQty.trim());
    setBuyDialogItem(null);
    setBuyQty('');
  };

  const activeOverlayItem = activeId ? activeItems.find(i => i.id === activeId) : null;
  const overlaySelectedCount = activeId && selectionMode && selectedIds.has(activeId) ? selectedIds.size : 0;

  return (
    <div className="space-y-4">
      {/* 常驻撤销条：任何增删改后显示，点「撤销」可回退，直到下一次操作或被撤销 */}
      {undoInfo && (
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl bg-grape-600 text-white shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <Undo2 size={16} className="shrink-0" />
            <span className="text-sm truncate">已 {undoInfo} · 可撤销</span>
          </div>
          <button
            onClick={onUndo}
            className="shrink-0 px-3.5 py-1.5 rounded-lg bg-white text-grape-700 text-sm font-semibold hover:bg-grape-50 transition-colors"
          >
            撤销
          </button>
        </div>
      )}

      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-grape-100 flex items-center justify-center">
            <ChefHat size={20} className="text-grape-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-sage-800">食材库</h2>
            <p className="text-xs text-sage-500">管理现有食材 · 做菜自动匹配</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeItems.length > 0 && layoutMode === 'quadrant' && (
            <button
              onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
              className={`flex items-center gap-1.5 px-3 h-9 rounded-xl text-sm font-medium transition-colors ${
                selectionMode
                  ? 'bg-grape-600 text-white hover:bg-grape-700'
                  : 'bg-grape-100 text-grape-600 hover:bg-grape-200'
              }`}
              title="批量选择多个食材一起换分类"
            >
              {selectionMode ? `已选 ${selectedIds.size} · 完成` : '选择'}
            </button>
          )}
          {activeItems.length > 0 && (
            <button
              onClick={toggleLayout}
              className="w-9 h-9 rounded-xl bg-grape-100 text-grape-600 flex items-center justify-center hover:bg-grape-200 transition-colors"
              title={layoutMode === 'list' ? '切换到四象限视图' : '切换到列表视图'}
            >
              {layoutMode === 'list' ? <LayoutGrid size={16} /> : <List size={16} />}
            </button>
          )}
          <button
            onClick={onNavigateToCooking}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-grape-600 text-white text-sm font-medium hover:bg-grape-700 transition-colors shadow-sm"
          >
            <ChefHat size={16} />
            做菜
          </button>
          <button
            onClick={onOpenCookingInNewTab}
            className="w-9 h-9 rounded-xl bg-grape-100 text-grape-600 flex items-center justify-center hover:bg-grape-200 transition-colors"
            title="做菜页面在新标签页打开"
          >
            <ExternalLink size={16} />
          </button>
        </div>
      </div>

      {/* 批量选择提示条 */}
      {selectionMode && (
        <div className="bg-grape-50 border border-grape-200 rounded-xl px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-grape-700">
            勾选多个食材，拖其中任意一个到目标象限 → 整批换分类
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set(activeItems.map(i => i.id)))}
              className="text-xs text-grape-600 hover:text-grape-700 underline"
            >
              全选
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-grape-600 hover:text-grape-700 underline"
            >
              清空
            </button>
          </div>
        </div>
      )}

      {/* 添加栏 */}
      <div className="bg-white rounded-2xl border border-sage-100 p-3 flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="食材名称"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-cream-100 border border-sage-100 text-sm focus:outline-none focus:border-grape-400"
        />
        <input
          type="text"
          value={newQty}
          onChange={e => setNewQty(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="数量"
          className="w-24 px-3 py-2 rounded-lg bg-cream-100 border border-sage-100 text-sm focus:outline-none focus:border-grape-400"
        />
        <button
          onClick={handleAdd}
          className="w-10 h-10 rounded-lg bg-grape-600 text-white flex items-center justify-center hover:bg-grape-700 transition-colors shrink-0"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* 现有食材 - 列表模式 */}
      {activeItems.length > 0 && layoutMode === 'list' && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-medium text-sage-500 tracking-wider">现有食材</span>
            <span className="text-xs text-sage-400">{activeItems.length} 项 · 长按拖拽排序</span>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={activeItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {activeItems.map(item => (
                  <SortablePantryItemCard
                    key={item.id}
                    item={item}
                    displayInfo={getPantryDisplay(item.id)}
                  onToggleChecked={onToggleChecked}
                  onEdit={onEditPantryItem}
                  onDelete={onDeletePantryItem}
                  onDeleteLoss={onDeleteLoss}
                  onNavigateToRecipe={onNavigateToRecipe}
                  selectionMode={false}
                    isSelected={false}
                    onToggleSelect={() => {}}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeOverlayItem ? <OverlayCard item={activeOverlayItem} count={0} /> : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* 现有食材 - 四象限模式 */}
      {activeItems.length > 0 && layoutMode === 'quadrant' && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-medium text-sage-500 tracking-wider">现有食材 · 四象限</span>
            <span className="text-xs text-sage-400">{activeItems.length} 项 · 拖到象限分类</span>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={quadrantCollision}
            onDragStart={handleDragStart}
            onDragEnd={handleQuadrantDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {QUADRANTS.map(q => {
                const items = itemsByCategory[q.id];
                const style = QUADRANT_STYLES[q.id];
                return (
                  <QuadrantZone
                    key={q.id}
                    category={q.id}
                    label={q.label}
                    Icon={q.icon}
                    items={items}
                    style={style}
                    isDragging={!!activeId}
                    selectionMode={selectionMode}
                    selectedIds={selectedIds}
                    getPantryDisplay={getPantryDisplay}
              onToggleChecked={onToggleChecked}
              onEdit={onEditPantryItem}
              onDelete={onDeletePantryItem}
              onDeleteLoss={onDeleteLoss}
              onNavigateToRecipe={onNavigateToRecipe}
              onToggleSelect={toggleSelect}
                  />
                );
              })}
            </div>
            <DragOverlay>
              {activeOverlayItem ? <OverlayCard item={activeOverlayItem} count={overlaySelectedCount} /> : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* 待购买 */}
      {toBuyItems.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-medium text-sage-500 tracking-wider">待购买</span>
            <span className="text-xs text-sage-400">{toBuyItems.length} 项</span>
          </div>
          <div className="space-y-2">
            {toBuyItems.map(item => (
              <ToBuyItemCard
                key={item.id}
                item={item}
                displayInfo={getPantryDisplay(item.id)}
                onBuyClick={handleBuyClick}
                onEdit={onEditPantryItem}
                onDelete={onDeletePantryItem}
                onNavigateToRecipe={onNavigateToRecipe}
              />
            ))}
          </div>
        </div>
      )}

      {/* 已用完 */}
      {checkedItems.length > 0 && (
        <div>
          <button
            onClick={() => setShowChecked(!showChecked)}
            className="flex items-center gap-1.5 mb-2 px-1 text-xs font-medium text-sage-500 tracking-wider hover:text-sage-700 transition-colors"
          >
            <span>已用完</span>
            <span className="text-sage-400">({checkedItems.length})</span>
            <span className="text-sage-400">{showChecked ? '收起' : '展开'}</span>
          </button>
          {showChecked && (
            <div className="space-y-2">
              {checkedItems.map(item => (
                <PantryItemCard
                  key={item.id}
                  item={item}
                  displayInfo={getPantryDisplay(item.id)}
                  onToggleChecked={onToggleChecked}
                  onEdit={onEditPantryItem}
                  onDelete={onDeletePantryItem}
                  onDeleteLoss={onDeleteLoss}
                  onNavigateToRecipe={onNavigateToRecipe}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 空状态 */}
      {pantryItems.length === 0 && (
        <div className="text-center py-16 text-sage-400">
          <ChefHat size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">还没有食材记录</p>
          <p className="text-xs mt-1">在上方添加你的第一份食材</p>
        </div>
      )}

      {/* 买好了确认弹窗 */}
      {buyDialogItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setBuyDialogItem(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-sage-100 w-[90%] max-w-sm overflow-hidden animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-sage-800">确认实际购买数量</h3>
              <button onClick={() => setBuyDialogItem(null)} className="text-sage-400 hover:text-sage-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 pb-3 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-sage-500 mb-1 block">名称</label>
                  <div className="px-3 py-2 rounded-lg bg-cream-100 border border-sage-100 text-sm text-sage-700">
                    {buyDialogItem.name}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-sage-500 mb-1 block">实际数量</label>
                  <input
                    type="text"
                    value={buyQty}
                    onChange={e => setBuyQty(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-2 rounded-lg bg-white border border-grape-400 text-sm focus:outline-none focus:border-grape-500"
                  />
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 pt-2 flex justify-end gap-2">
              <button
                onClick={() => setBuyDialogItem(null)}
                className="px-4 py-2 rounded-lg border border-sage-200 text-sm text-sage-600 hover:bg-sage-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleBuyConfirm}
                className="px-4 py-2 rounded-lg bg-grape-600 text-white text-sm font-medium hover:bg-grape-700 transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 拖拽时跟随指针的浮层卡片 =====

function OverlayCard({ item, count }: { item: PantryItem; count: number }) {
  const cat = (item.category || 'other') as PantryCategory;
  return (
    <div className={`bg-white rounded-xl border-2 p-3 shadow-2xl rotate-2 ${cat === 'meat_dairy' ? 'border-terra-300' : cat === 'vegetable' ? 'border-ocean-300' : cat === 'staple' ? 'border-gold-300' : 'border-grape-300'}`}>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-sage-800">{item.name}</span>
        <span className="text-sm text-sage-500">{item.quantity}</span>
        {count > 1 && (
          <span className="ml-auto text-xs font-medium text-grape-600 bg-grape-100 px-2 py-0.5 rounded-full">
            移动 {count} 项
          </span>
        )}
      </div>
    </div>
  );
}

// ===== 四象限区块（可放置区域 + 组内排序） =====

function QuadrantZone({
  category, label, Icon, items, style, isDragging, selectionMode, selectedIds,
  getPantryDisplay, onToggleChecked, onEdit, onDelete, onDeleteLoss, onNavigateToRecipe, onToggleSelect,
}: {
  category: PantryCategory;
  label: string;
  Icon: typeof Beef;
  items: PantryItem[];
  style: { dot: string; icon: string; label: string; zone: string; zoneOver: string };
  isDragging: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  getPantryDisplay: (id: string) => PantryDisplayInfo;
  onToggleChecked: (id: string) => void;
  onEdit: (id: string, updates: { name?: string; quantity?: string }, lossReason?: LossReason) => Promise<void>;
  onDelete: (id: string) => void;
  onNavigateToRecipe: (recipeId: string) => void;
  onToggleSelect: (id: string) => void;
  onDeleteLoss: (id: string, lossId: string) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `quad-${category}` });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border-2 p-2 sm:p-3 min-h-[140px] sm:min-h-[160px] max-h-[calc(50vh-70px)] sm:max-h-[calc(50vh-60px)] flex flex-col overflow-hidden transition-all ${style.zone} ${
        isOver ? 'border-solid ' + style.zoneOver + ' scale-[1.02] shadow-lg'
        : isDragging ? 'border-dashed border-sage-300'
        : 'border-dashed border-sage-200/60'
      }`}
    >
      <div className="flex items-center justify-between mb-1.5 sm:mb-2 px-1 shrink-0">
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
          <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${style.icon}`} />
          <span className={`text-xs font-medium truncate max-w-[4rem] sm:max-w-[6rem] ${style.label}`}>{label}</span>
        </div>
        <span className="text-xs text-sage-400">{items.length}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {items.map(item => (
              <SortablePantryItemCard
                key={item.id}
                item={item}
                displayInfo={getPantryDisplay(item.id)}
                onToggleChecked={onToggleChecked}
                onEdit={onEdit}
                onDelete={onDelete}
                onDeleteLoss={onDeleteLoss}
                onNavigateToRecipe={onNavigateToRecipe}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(item.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </div>
        </SortableContext>
        {items.length === 0 && (
          <div className={`text-center text-xs py-4 ${isOver ? style.label : 'text-sage-300'}`}>
            {isOver ? '松手放到这里' : '拖食材到这里'}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== 可拖拽的现有食材卡片 =====

function SortablePantryItemCard({
  item, displayInfo, onToggleChecked, onEdit, onDelete, onDeleteLoss, onNavigateToRecipe,
  selectionMode, isSelected, onToggleSelect,
}: {
  item: PantryItem;
  displayInfo: PantryDisplayInfo;
  onToggleChecked: (id: string) => void;
  onEdit: (id: string, updates: { name?: string; quantity?: string }, lossReason?: LossReason) => Promise<void>;
  onDelete: (id: string) => void;
  onDeleteLoss: (id: string, lossId: string) => Promise<void>;
  onNavigateToRecipe: (recipeId: string) => void;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id });

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editQty, setEditQty] = useState(item.quantity);
  const [editLoss, setEditLoss] = useState(false);
  const [editLossReason, setEditLossReason] = useState<LossReason>('spoiled');

  const isChecked = item.status === 'checked';
  const isRemaining = displayInfo.displayQuantity.startsWith('剩');

  const handleSaveEdit = async (name: string, quantity: string | undefined, reason: LossReason | undefined) => {
    const updates: { name?: string; quantity?: string } = {};
    if (name.trim() && name !== item.name) updates.name = name.trim();
    if (quantity !== undefined && quantity !== item.quantity) updates.quantity = quantity;
    if (Object.keys(updates).length > 0) {
      await onEdit(item.id, updates, reason);
    } else {
      setEditName(item.name);
      setEditQty(item.quantity);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(item.name);
    setEditQty(item.quantity);
    setEditLoss(false);
    setEditLossReason('spoiled');
    setEditing(false);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 50 : 'auto' as const,
  };

  return (
    <SwipeToDelete onDelete={() => onDelete(item.id)} overflowVisible={isDragging}>
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={selectionMode ? () => onToggleSelect(item.id) : undefined}
        className={`bg-white rounded-xl border p-2 sm:p-3 transition-shadow ${
          isSelected ? 'border-grape-400 bg-grape-50/50 ring-2 ring-grape-200' : 'border-sage-100'
        } ${isChecked ? 'opacity-50' : ''} ${isDragging ? 'shadow-lg border-2 border-dashed border-grape-300 bg-grape-50/40' : ''}`}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          {/* 左侧：选择模式=勾选框，普通模式=勾选用完圆点 */}
          {selectionMode ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
              className="shrink-0 text-sage-300 hover:text-grape-500 transition-colors"
            >
              {isSelected ? <CheckCircle size={20} className="text-grape-600" /> : <Circle size={20} />}
            </button>
          ) : (
            <button
              onClick={() => onToggleChecked(item.id)}
              className="shrink-0 text-sage-300 hover:text-sage-500 transition-colors"
            >
              {isChecked ? <CheckCircle size={20} className="text-sage-400" /> : <Circle size={20} />}
            </button>
          )}
          {editing ? (
            <PantryEditRow
              editName={editName}
              editQty={editQty}
              editLoss={editLoss}
              editLossReason={editLossReason}
              baseQty={item.quantity}
              onName={setEditName}
              onQty={setEditQty}
              onLossToggle={setEditLoss}
              onLossReason={setEditLossReason}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="flex items-baseline gap-2 flex-1 min-w-0"
                onDoubleClick={() => !selectionMode && setEditing(true)}
              >
                <span className={`text-sm font-medium ${isChecked ? 'text-sage-400 line-through' : 'text-sage-800'}`}>
                  {item.name}
                </span>
                <span className={`text-sm ${isRemaining ? 'text-grape-600 font-medium' : isChecked ? 'text-sage-400 line-through' : 'text-sage-500'}`}>
                  {displayInfo.displayQuantity}
                </span>
                {displayInfo.insufficient && (
                  <span className="text-xs text-red-500 font-medium shrink-0">不够了</span>
                )}
              </div>
              {!selectionMode && (
                <button
                  onClick={() => setEditing(true)}
                  title="编辑数量 / 损耗"
                  className="shrink-0 text-sage-300 hover:text-grape-500 transition-colors"
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        {/* 损耗标注 */}
        {item.losses && item.losses.length > 0 && !editing && (
          <LossList losses={item.losses} onDelete={(lossId) => onDeleteLoss(item.id, lossId)} />
        )}
        {/* 使用标注 */}
        {displayInfo.usages.length > 0 && !editing && (
          <UsageList usages={displayInfo.usages} onNavigateToRecipe={onNavigateToRecipe} />
        )}
      </div>
    </SwipeToDelete>
  );
}

// ===== 普通食材卡片（已用完区，不可拖拽） =====

function PantryItemCard({
  item, displayInfo, onToggleChecked, onEdit, onDelete, onDeleteLoss, onNavigateToRecipe,
}: {
  item: PantryItem;
  displayInfo: PantryDisplayInfo;
  onToggleChecked: (id: string) => void;
  onEdit: (id: string, updates: { name?: string; quantity?: string }, lossReason?: LossReason) => Promise<void>;
  onDelete: (id: string) => void;
  onDeleteLoss: (id: string, lossId: string) => Promise<void>;
  onNavigateToRecipe: (recipeId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editQty, setEditQty] = useState(item.quantity);
  const [editLoss, setEditLoss] = useState(false);
  const [editLossReason, setEditLossReason] = useState<LossReason>('spoiled');

  const isChecked = item.status === 'checked';
  const isRemaining = displayInfo.displayQuantity.startsWith('剩');

  const handleSaveEdit = async (name: string, quantity: string | undefined, reason: LossReason | undefined) => {
    const updates: { name?: string; quantity?: string } = {};
    if (name.trim() && name !== item.name) updates.name = name.trim();
    if (quantity !== undefined && quantity !== item.quantity) updates.quantity = quantity;
    if (Object.keys(updates).length > 0) {
      await onEdit(item.id, updates, reason);
    } else {
      setEditName(item.name);
      setEditQty(item.quantity);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(item.name);
    setEditQty(item.quantity);
    setEditLoss(false);
    setEditLossReason('spoiled');
    setEditing(false);
  };

  return (
    <SwipeToDelete onDelete={() => onDelete(item.id)}>
      <div className={`bg-white rounded-xl border border-sage-100 p-3 ${isChecked ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onToggleChecked(item.id)}
            className="shrink-0 text-sage-300 hover:text-sage-500 transition-colors"
          >
            {isChecked ? <CheckCircle size={20} className="text-sage-400" /> : <Circle size={20} />}
          </button>
          {editing ? (
            <PantryEditRow
              editName={editName}
              editQty={editQty}
              editLoss={editLoss}
              editLossReason={editLossReason}
              baseQty={item.quantity}
              onName={setEditName}
              onQty={setEditQty}
              onLossToggle={setEditLoss}
              onLossReason={setEditLossReason}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
            />
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="flex items-baseline gap-2 flex-1 min-w-0"
                onDoubleClick={() => setEditing(true)}
              >
                <span className={`text-sm font-medium ${isChecked ? 'text-sage-400 line-through' : 'text-sage-800'}`}>
                  {item.name}
                </span>
                <span className={`text-sm ${isRemaining ? 'text-grape-600 font-medium' : isChecked ? 'text-sage-400 line-through' : 'text-sage-500'}`}>
                  {displayInfo.displayQuantity}
                </span>
                {displayInfo.insufficient && (
                  <span className="text-xs text-red-500 font-medium shrink-0">不够了</span>
                )}
              </div>
              <button
                onClick={() => setEditing(true)}
                title="编辑数量 / 损耗"
                className="shrink-0 text-sage-300 hover:text-grape-500 transition-colors"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
        </div>
        {/* 损耗标注 */}
        {item.losses && item.losses.length > 0 && !editing && (
          <LossList losses={item.losses} onDelete={(lossId) => onDeleteLoss(item.id, lossId)} />
        )}
        {/* 使用标注 */}
        {displayInfo.usages.length > 0 && !editing && (
          <UsageList usages={displayInfo.usages} onNavigateToRecipe={onNavigateToRecipe} />
        )}
      </div>
    </SwipeToDelete>
  );
}

// ===== 待买食材卡片 =====

function ToBuyItemCard({
  item, displayInfo, onBuyClick, onEdit, onDelete, onNavigateToRecipe,
}: {
  item: PantryItem;
  displayInfo: PantryDisplayInfo;
  onBuyClick: (item: PantryItem) => void;
  onEdit: (id: string, updates: { name?: string; quantity?: string }, lossReason?: LossReason) => Promise<void>;
  onDelete: (id: string) => void;
  onNavigateToRecipe: (recipeId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editQty, setEditQty] = useState(item.quantity);
  const [editLoss, setEditLoss] = useState(false);
  const [editLossReason, setEditLossReason] = useState<LossReason>('spoiled');

  const handleSaveEdit = async (name: string, quantity: string | undefined, reason: LossReason | undefined) => {
    const updates: { name?: string; quantity?: string } = {};
    if (name.trim() && name !== item.name) updates.name = name.trim();
    if (quantity !== undefined && quantity !== item.quantity) updates.quantity = quantity;
    if (Object.keys(updates).length > 0) {
      await onEdit(item.id, updates, reason);
    } else {
      setEditName(item.name);
      setEditQty(item.quantity);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(item.name);
    setEditQty(item.quantity);
    setEditLoss(false);
    setEditLossReason('spoiled');
    setEditing(false);
  };

  const card = (
    <div className="bg-red-50 rounded-xl border border-red-100 p-3">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-red-400 shrink-0 ml-0.5" />
        {editing ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveEdit(editName, editQty, undefined);
                if (e.key === 'Escape') handleCancelEdit();
              }}
              autoFocus
              className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-white border border-grape-400 text-sm focus:outline-none focus:border-grape-500"
            />
            <input
              type="text"
              value={editQty}
              onChange={e => setEditQty(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveEdit(editName, editQty, undefined);
                if (e.key === 'Escape') handleCancelEdit();
              }}
              className="w-20 px-2 py-1 rounded-lg bg-white border border-grape-400 text-sm focus:outline-none focus:border-grape-500"
            />
            <button
              onClick={() => handleSaveEdit(editName, editQty, undefined)}
              className="w-7 h-7 rounded-lg bg-grape-600 text-white flex items-center justify-center shrink-0"
            >
              <Check size={14} />
            </button>
            <button
              onClick={handleCancelEdit}
              className="w-7 h-7 rounded-lg text-sage-400 hover:bg-sage-100 flex items-center justify-center shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div
            className="flex items-baseline gap-2 flex-1 min-w-0"
            onDoubleClick={() => setEditing(true)}
          >
            <span className="text-sm font-medium text-sage-800">{item.name}</span>
            <span className="text-sm text-sage-500">{displayInfo.displayQuantity}</span>
            {item.isVirtual && (
              <span className="text-[10px] text-sage-400 bg-sage-100 px-1.5 py-0.5 rounded">自动</span>
            )}
          </div>
        )}
        <button
          onClick={() => onBuyClick(item)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors shrink-0"
        >
          <ShoppingCart size={13} />
          买好了
        </button>
      </div>
      {/* 使用标注 */}
      {displayInfo.usages.length > 0 && (
        <UsageList usages={displayInfo.usages} onNavigateToRecipe={onNavigateToRecipe} />
      )}
    </div>
  );

  // 虚拟待买项（菜谱自动生成）不可删除，不包 SwipeToDelete
  if (item.isVirtual) return card;

  return (
    <SwipeToDelete onDelete={() => onDelete(item.id)}>
      {card}
    </SwipeToDelete>
  );
}

// ===== 使用标注列表（已用/需用，区分扣减状态） =====

function UsageList({ usages, onNavigateToRecipe }: {
  usages: PantryUsageInfo[];
  onNavigateToRecipe: (recipeId: string) => void;
}) {
  return (
    <div className="ml-8 mt-1.5 space-y-1">
      {usages.map((u, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            u.deducted ? 'bg-sage-400' :
            u.status === 'used' ? 'bg-orange-400' :
            'bg-ocean-400'
          }`} />
          <span className={
            u.deducted ? 'text-sage-600' :
            u.status === 'used' ? 'text-orange-600' :
            'text-ocean-600'
          }>
            {u.deducted ? '已用 ' : u.status === 'used' ? '已用 ' : '需用 '}
            {u.quantity}
          </span>
          <span className="text-sage-400">→</span>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onNavigateToRecipe(u.recipeId)}
            className="text-grape-600 hover:text-grape-700 hover:underline transition-colors"
          >
            {u.recipeTitle}
          </button>
        </div>
      ))}
    </div>
  );
}

// ===== 可复用的行内编辑区（名称 + 数量/损耗量 + 保存/取消 + 损耗标记） =====
// 损耗语义翻转：勾选「标记为损耗」后，数量框的语义由「剩余量」变为「损耗量」。
// 用户直接填坏了多少（如 60g）。剩余量在【保存时】用 baseQty − 损耗量 单一计算，
// 不再每键把损耗量写回 editQty（旧实现来回同步，输入顺序异常时会把食材算成归零）。
// 空损耗文本 = 不记损耗（纯改名/不改量）。

function PantryEditRow({
  editName, editQty, editLoss, editLossReason, baseQty,
  onName, onQty, onLossToggle, onLossReason, onSave, onCancel,
}: {
  editName: string;
  editQty: string;
  editLoss: boolean;
  editLossReason: LossReason;
  baseQty: string;
  onName: (v: string) => void;
  onQty: (v: string) => void;
  onLossToggle: (v: boolean) => void;
  onLossReason: (v: LossReason) => void;
  onSave: (name: string, quantity: string | undefined, reason: LossReason | undefined) => void;
  onCancel: () => void;
}) {
  // 损耗量文本（损耗模式下唯一的编辑字段）
  const [lossText, setLossText] = useState('');

  // 进入损耗模式时清空，让用户直接输入坏了多少（不再预填 0g，避免误以为已填）
  useEffect(() => {
    if (editLoss) setLossText('');
  }, [editLoss]);

  const handleLossText = (v: string) => setLossText(v);

  // —— 单一数据源：剩余量 = 库存 − 损耗量（仅在展示/保存时计算，不回写 editQty）——
  const remaining = editLoss
    ? (quantitySubtract(baseQty, lossText || '0') ?? baseQty)
    : editQty;

  // 损耗是否超过库存（将归零）→ 醒目警告，避免静默灾难性扣减
  const baseParsed = parseQuantity(baseQty);
  const lossParsed = parseQuantity(lossText || '0');
  const lossExceeds = editLoss && !!lossText.trim() && !!baseParsed && !!lossParsed &&
    unitsMatch(baseParsed.unit, lossParsed.unit) &&
    subtractFraction(baseParsed.numerator, baseParsed.denominator, lossParsed.numerator, lossParsed.denominator).num < 0;
  // 损耗单位与库存不一致 → 无法计算，提示带相同单位
  const lossMismatch = editLoss && !!lossText.trim() && !!baseParsed && !!lossParsed &&
    !unitsMatch(baseParsed.unit, lossParsed.unit);

  // 大损耗二次确认：损耗量 >100 或超过库存 30% 时弹窗，避免手误把 60g 输成 640g
  const shouldConfirmLoss = editLoss && !!lossText.trim() && !!baseParsed && !!lossParsed &&
    unitsMatch(baseParsed.unit, lossParsed.unit) &&
    baseParsed.number > 0 &&
    (lossParsed.number > 100 || lossParsed.number / baseParsed.number > 0.3);

  const handleSave = () => {
    if (editLoss) {
      // 损耗模式：提交剩余量；空损耗文本 = 不记损耗
      const reason = lossText.trim() ? editLossReason : undefined;
      if (shouldConfirmLoss) {
        const msg = `确认记录「${editName || '该食材'}」损耗 ${lossText} 吗？\n保存后剩余将变为 ${remaining}，且会加入损耗记录。\n\n如果只是想修改数量（不是损耗），请取消勾选「标记为损耗」后再保存。`;
        if (!window.confirm(msg)) return;
      }
      onSave(editName, remaining, reason);
    } else {
      onSave(editName, editQty, undefined);
    }
  };

  const qtyValue = editLoss ? lossText : editQty;
  const qtyOnChange = editLoss ? handleLossText : onQty;

  return (
    <div className="flex-1 min-w-0 space-y-1.5" onPointerDown={e => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={editName}
          onChange={e => onName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
          autoFocus
          className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-white border border-grape-400 text-sm focus:outline-none focus:border-grape-500"
        />
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg bg-white border text-sm ${
          editLoss ? 'border-red-300 focus-within:border-red-400' : 'border-grape-400 focus-within:border-grape-500'
        }`}>
          {editLoss && (
            <span className="text-xs text-red-500 whitespace-nowrap select-none">损耗</span>
          )}
          <input
            type="text"
            value={qtyValue}
            onChange={e => qtyOnChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
            placeholder={editLoss ? '如 60g' : '数量'}
            className={`w-16 bg-transparent focus:outline-none text-sm ${
              editLoss ? 'text-red-600 placeholder:text-red-300' : ''
            }`}
          />
        </div>
        <button
          onClick={handleSave}
          title={editLoss ? '确认损耗' : '保存'}
          className={`w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0 ${
            editLoss ? 'bg-red-500 hover:bg-red-600' : 'bg-grape-600 hover:bg-grape-700'
          }`}
        >
          <Check size={14} />
        </button>
        <button
          onClick={onCancel}
          className="w-7 h-7 rounded-lg text-sage-400 hover:bg-sage-100 flex items-center justify-center shrink-0"
        >
          <X size={14} />
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-sage-500 select-none cursor-pointer">
        <input
          type="checkbox"
          checked={editLoss}
          onChange={e => onLossToggle(e.target.checked)}
          className="accent-red-500"
        />
        标记为损耗（坏的 / 过期的）
      </label>
      {editLoss && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={editLossReason}
              onChange={e => onLossReason(e.target.value as LossReason)}
              className="px-2 py-1 rounded-lg bg-white border border-sage-200 text-xs text-sage-600 focus:outline-none focus:border-grape-400"
            >
              {(['spoiled', 'expired', 'overcooked', 'other'] as LossReason[]).map(r => (
                <option key={r} value={r}>{LOSS_REASON_LABELS[r]}</option>
              ))}
            </select>
            <span className={`text-sm font-medium ${lossExceeds ? 'text-red-600' : 'text-sage-600'}`}>
              损耗 <span className="font-bold text-red-600">{lossText || '0'}</span>
              <span className="mx-1 text-sage-400">→</span>
              剩余 <span className={`font-bold ${lossExceeds ? 'text-red-600' : 'text-grape-600'}`}>{remaining}</span>
            </span>
          </div>
          {lossExceeds && (
            <div className="flex items-center gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
              <AlertTriangle size={12} className="shrink-0" />
              损耗量≥库存，食材将归零。确认无误再保存，或点顶部「撤销」回退。
            </div>
          )}
          {lossMismatch && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
              <AlertTriangle size={12} className="shrink-0" />
              损耗单位与库存不一致（如库存写 500g、损耗写 2个），无法计算，请带相同单位。
            </div>
          )}
          {shouldConfirmLoss && !lossExceeds && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
              <AlertTriangle size={12} className="shrink-0" />
              损耗量较大，保存时会再次确认。
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 损耗记录展示 =====

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = 86400000;
  if (diff < 0) return '刚刚';
  if (diff < day) return '今天';
  if (diff < 2 * day) return '昨天';
  if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function LossList({ losses, onDelete }: { losses: PantryLoss[]; onDelete?: (lossId: string) => void }) {
  return (
    <div className="ml-8 mt-1.5 space-y-1">
      {losses.map(l => (
        <div key={l.id} className="flex items-center gap-1.5 text-xs text-red-500/90">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
          <span>损耗 −{l.quantity}</span>
          <span className="text-sage-300">·</span>
          <span>{LOSS_REASON_LABELS[l.reason]}</span>
          <span className="text-sage-300">·</span>
          <span className="text-sage-400">{formatRelativeDate(l.createdAt)}</span>
          {onDelete && (
            <button
              onClick={() => onDelete(l.id)}
              title="删除这条损耗记录（库存会加回）"
              className="ml-0.5 text-sage-300 hover:text-red-500 transition-colors shrink-0"
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
