import { useState, useMemo, useRef } from 'react';
import { Plus, Circle, CheckCircle, X, ChefHat, ShoppingCart, Trash2, GripVertical, ExternalLink, LayoutGrid, List, Beef, Carrot, Wheat, Package } from 'lucide-react';
import {
  DndContext, closestCenter, pointerWithin, PointerSensor, useSensor, useSensors, useDroppable, DragOverlay,
  type DragEndEvent, type DragStartEvent, type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PantryItem, PantryUsage, PantryStatus, PantryCategory } from '../types';

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
  getPantryUsage: (id: string) => PantryUsage[];
  onCreatePantryItem: (name: string, quantity: string, status: PantryStatus) => Promise<void>;
  onToggleChecked: (id: string) => Promise<void>;
  onConvertToBuy: (id: string, quantity: string) => Promise<void>;
  onDeletePantryItem: (id: string) => Promise<void>;
  onReorder: (activeList: PantryItem[], oldIndex: number, newIndex: number) => Promise<void>;
  onSetCategory: (id: string, category: PantryCategory) => Promise<void>;
  onSetCategoryBatch: (ids: string[], category: PantryCategory) => Promise<void>;
  onNavigateToRecipe: (recipeId: string) => void;
  onNavigateToCooking: () => void;
  onOpenCookingInNewTab: () => void;
}

export default function PantryView({
  pantryItems, getPantryUsage, onCreatePantryItem, onToggleChecked, onConvertToBuy,
  onDeletePantryItem, onReorder, onSetCategory, onSetCategoryBatch, onNavigateToRecipe, onNavigateToCooking, onOpenCookingInNewTab,
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

  // 手柄即点即拖（bypass 延迟），其他位置长按 250ms 激活
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
      bypassActivationConstraint: ({ event }) => {
        const target = (event as PointerEvent).target as HTMLElement | null;
        return !!target?.closest('[data-pantry-handle]');
      },
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
      // 拖到同象限上的其他项 → 排序（仅单个）
      if (activeCat === targetCategory && !overId.startsWith('quad-')) {
        const catItems = itemsByCategory[activeCat];
        const oldIndex = catItems.findIndex(i => i.id === active.id);
        const newIndex = catItems.findIndex(i => i.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          onReorder(catItems, oldIndex, newIndex);
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
    await onCreatePantryItem(newName.trim(), newQty.trim(), 'active');
    setNewName('');
    setNewQty('');
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
            <span className="text-xs text-sage-400">{activeItems.length} 项 · 拖手柄排序</span>
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
                    usages={getPantryUsage(item.id)}
                    onToggleChecked={onToggleChecked}
                    onDelete={onDeletePantryItem}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                    getPantryUsage={getPantryUsage}
                    onToggleChecked={onToggleChecked}
                    onDelete={onDeletePantryItem}
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
                usages={getPantryUsage(item.id)}
                onBuyClick={handleBuyClick}
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
                  usages={[]}
                  onToggleChecked={onToggleChecked}
                  onDelete={onDeletePantryItem}
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
  const style = QUADRANT_STYLES[cat];
  return (
    <div className={`bg-white rounded-xl border-2 p-3 shadow-2xl rotate-2 ${cat === 'meat_dairy' ? 'border-terra-300' : cat === 'vegetable' ? 'border-ocean-300' : cat === 'staple' ? 'border-gold-300' : 'border-grape-300'}`}>
      <div className="flex items-center gap-3">
        <GripVertical size={16} className="shrink-0 text-sage-300" />
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
  getPantryUsage, onToggleChecked, onDelete, onNavigateToRecipe, onToggleSelect,
}: {
  category: PantryCategory;
  label: string;
  Icon: typeof Beef;
  items: PantryItem[];
  style: { dot: string; icon: string; label: string; zone: string; zoneOver: string };
  isDragging: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  getPantryUsage: (id: string) => PantryUsage[];
  onToggleChecked: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigateToRecipe: (recipeId: string) => void;
  onToggleSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `quad-${category}` });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border-2 p-3 min-h-[110px] transition-all ${style.zone} ${
        isOver ? 'border-solid ' + style.zoneOver + ' scale-[1.02] shadow-lg'
        : isDragging ? 'border-dashed border-sage-300'
        : 'border-dashed border-sage-200/60'
      }`}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <Icon size={15} className={style.icon} />
          <span className={`text-xs font-medium ${style.label}`}>{label}</span>
        </div>
        <span className="text-xs text-sage-400">{items.length}</span>
      </div>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map(item => (
            <SortablePantryItemCard
              key={item.id}
              item={item}
              usages={getPantryUsage(item.id)}
              onToggleChecked={onToggleChecked}
              onDelete={onDelete}
              onNavigateToRecipe={onNavigateToRecipe}
              selectionMode={selectionMode}
              isSelected={selectedIds.has(item.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
          {items.length === 0 && (
            <div className={`text-center text-xs py-4 ${isOver ? style.label : 'text-sage-300'}`}>
              {isOver ? '松手放到这里' : '拖食材到这里'}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ===== 可拖拽的现有食材卡片 =====

function SortablePantryItemCard({
  item, usages, onToggleChecked, onDelete, onNavigateToRecipe,
  selectionMode, isSelected, onToggleSelect,
}: {
  item: PantryItem;
  usages: PantryUsage[];
  onToggleChecked: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigateToRecipe: (recipeId: string) => void;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id });

  const isChecked = item.status === 'checked';

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 50 : 'auto' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={selectionMode ? () => onToggleSelect(item.id) : undefined}
      className={`bg-white rounded-xl border p-3 touch-none transition-shadow ${
        isSelected ? 'border-grape-400 bg-grape-50/50 ring-2 ring-grape-200' : 'border-sage-100'
      } ${isChecked ? 'opacity-50' : ''} ${isDragging ? 'shadow-lg border-grape-300' : ''}`}
    >
      <div className="flex items-center gap-3">
        {/* 左侧：选择模式=勾选框，普通模式=勾选用完圆点 */}
        {selectionMode ? (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
            className="shrink-0 text-sage-300 hover:text-grape-500 transition-colors"
          >
            {isSelected ? <CheckCircle size={20} className="text-grape-600" /> : <Circle size={20} />}
          </button>
        ) : (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onToggleChecked(item.id)}
            className="shrink-0 text-sage-300 hover:text-sage-500 transition-colors"
          >
            {isChecked ? <CheckCircle size={20} className="text-sage-400" /> : <Circle size={20} />}
          </button>
        )}
        {/* 拖拽手柄：即点即拖 */}
        <span
          data-pantry-handle
          className="shrink-0 flex items-center justify-center w-5 h-5 -ml-1 cursor-grab active:cursor-grabbing text-sage-200 hover:text-grape-400 transition-colors touch-none"
          title="拖动"
        >
          <GripVertical size={16} />
        </span>
        <div className="flex items-baseline gap-2 flex-1 min-w-0">
          <span className={`text-sm font-medium ${isChecked ? 'text-sage-400 line-through' : 'text-sage-800'}`}>
            {item.name}
          </span>
          <span className={`text-sm ${isChecked ? 'text-sage-400 line-through' : 'text-sage-500'}`}>
            {item.quantity}
          </span>
        </div>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onDelete(item.id)}
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sage-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="删除"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {/* 使用标注 */}
      {usages.length > 0 && (
        <div className="ml-8 mt-1.5 space-y-1">
          {usages.map((u, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-sage-400 shrink-0" />
              <span className="text-sage-600">已使用 {u.recipeItemQuantity}</span>
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
      )}
    </div>
  );
}

// ===== 普通食材卡片（已用完区，不可拖拽） =====

function PantryItemCard({
  item, usages, onToggleChecked, onDelete, onNavigateToRecipe,
}: {
  item: PantryItem;
  usages: PantryUsage[];
  onToggleChecked: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigateToRecipe: (recipeId: string) => void;
}) {
  const isChecked = item.status === 'checked';

  return (
    <div className={`bg-white rounded-xl border border-sage-100 p-3 ${isChecked ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onToggleChecked(item.id)}
          className="shrink-0 text-sage-300 hover:text-sage-500 transition-colors"
        >
          {isChecked ? <CheckCircle size={20} className="text-sage-400" /> : <Circle size={20} />}
        </button>
        <div className="flex items-baseline gap-2 flex-1 min-w-0">
          <span className={`text-sm font-medium ${isChecked ? 'text-sage-400 line-through' : 'text-sage-800'}`}>
            {item.name}
          </span>
          <span className={`text-sm ${isChecked ? 'text-sage-400 line-through' : 'text-sage-500'}`}>
            {item.quantity}
          </span>
        </div>
        <button
          onClick={() => onDelete(item.id)}
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sage-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="删除"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {/* 使用标注 */}
      {usages.length > 0 && (
        <div className="ml-8 mt-1.5 space-y-1">
          {usages.map((u, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-sage-400 shrink-0" />
              <span className="text-sage-600">已使用 {u.recipeItemQuantity}</span>
              <span className="text-sage-400">→</span>
              <button
                onClick={() => onNavigateToRecipe(u.recipeId)}
                className="text-grape-600 hover:text-grape-700 hover:underline transition-colors"
              >
                {u.recipeTitle}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== 待买食材卡片 =====

function ToBuyItemCard({
  item, usages, onBuyClick, onDelete, onNavigateToRecipe,
}: {
  item: PantryItem;
  usages: PantryUsage[];
  onBuyClick: (item: PantryItem) => void;
  onDelete: (id: string) => void;
  onNavigateToRecipe: (recipeId: string) => void;
}) {
  return (
    <div className="bg-red-50 rounded-xl border border-red-100 p-3">
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-red-400 shrink-0 ml-0.5" />
        <div className="flex items-baseline gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium text-sage-800">{item.name}</span>
          <span className="text-sm text-sage-500">{item.quantity}</span>
          {item.isVirtual && (
            <span className="text-[10px] text-sage-400 bg-sage-100 px-1.5 py-0.5 rounded">自动</span>
          )}
        </div>
        {!item.isVirtual && (
          <button
            onClick={() => onDelete(item.id)}
            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sage-300 hover:text-red-500 hover:bg-red-100 transition-colors"
            title="删除"
          >
            <Trash2 size={15} />
          </button>
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
      {usages.length > 0 && (
        <div className="ml-8 mt-1.5 space-y-1">
          {usages.map((u, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-red-300 shrink-0" />
              <span className="text-sage-600">需要 {u.recipeItemQuantity}</span>
              <span className="text-sage-400">→</span>
              <button
                onClick={() => onNavigateToRecipe(u.recipeId)}
                className="text-grape-600 hover:text-grape-700 hover:underline transition-colors"
              >
                {u.recipeTitle}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
