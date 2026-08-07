import { useState, useEffect } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter, type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, X, ChefHat, ArrowLeft, Check, RotateCcw, ChevronDown, ChevronUp, Undo2 } from 'lucide-react';
import type { Recipe, RecipeItemWithMatch } from '../types';
import SwipeToDelete from './SwipeToDelete';

interface CookingViewProps {
  recipes: Recipe[];
  getRecipeItemsWithMatch: (recipeId: string) => RecipeItemWithMatch[];
  onCreateRecipe: (title: string) => Promise<Recipe | null>;
  onEditRecipeTitle: (id: string, title: string) => Promise<void>;
  onToggleActive: (id: string) => Promise<void>;
  onUndoCompletion: (id: string) => Promise<void>;
  onDeleteRecipe: (id: string) => Promise<void>;
  onCreateRecipeItem: (recipeId: string, name: string, quantity: string) => Promise<void>;
  onEditRecipeItem: (id: string, updates: { name?: string; quantity?: string }) => Promise<void>;
  onDeleteRecipeItem: (id: string) => Promise<void>;
  onReorderRecipes: (recipes: Recipe[], oldIndex: number, newIndex: number) => Promise<void>;
  onNavigateToPantry: () => void;
}

export default function CookingView({
  recipes, getRecipeItemsWithMatch,
  onCreateRecipe, onEditRecipeTitle, onToggleActive, onUndoCompletion, onDeleteRecipe,
  onCreateRecipeItem, onEditRecipeItem, onDeleteRecipeItem,
  onReorderRecipes, onNavigateToPantry,
}: CookingViewProps) {
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [newRecipeTitle, setNewRecipeTitle] = useState('');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    })
  );

  const handleCreateRecipe = async () => {
    if (!newRecipeTitle.trim()) return;
    await onCreateRecipe(newRecipeTitle.trim());
    setNewRecipeTitle('');
    setShowNewRecipe(false);
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(e.active.id as string);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = recipes.findIndex(r => r.id === active.id);
    const newIndex = recipes.findIndex(r => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderRecipes(recipes, oldIndex, newIndex);
  };

  const activeDragRecipe = activeDragId ? recipes.find(r => r.id === activeDragId) : null;

  return (
    <div className="space-y-4">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateToPantry}
            className="w-9 h-9 rounded-xl border border-sage-200 flex items-center justify-center text-sage-500 hover:bg-sage-50 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-sage-800">做菜</h2>
            <p className="text-xs text-sage-500">长按菜谱名称拖拽排序 · 双击食材修改</p>
          </div>
        </div>
      </div>

      {/* 添加新菜谱 */}
      {showNewRecipe ? (
        <div className="bg-white rounded-2xl border border-grape-300 p-3 flex items-center gap-2">
          <input
            type="text"
            value={newRecipeTitle}
            onChange={e => setNewRecipeTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateRecipe();
              if (e.key === 'Escape') { setShowNewRecipe(false); setNewRecipeTitle(''); }
            }}
            placeholder="菜名，如：清炒苦瓜"
            autoFocus
            className="flex-1 px-3 py-2 rounded-lg bg-cream-100 border border-sage-100 text-sm focus:outline-none focus:border-grape-400"
          />
          <button
            onClick={handleCreateRecipe}
            className="px-4 py-2 rounded-lg bg-grape-600 text-white text-sm font-medium hover:bg-grape-700 transition-colors shrink-0"
          >
            添加
          </button>
          <button
            onClick={() => { setShowNewRecipe(false); setNewRecipeTitle(''); }}
            className="w-9 h-9 rounded-lg text-sage-400 hover:bg-sage-50 flex items-center justify-center shrink-0"
          >
            <X size={18} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNewRecipe(true)}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-grape-300 text-grape-600 text-sm font-medium hover:bg-grape-50 transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus size={18} />
          添加新菜谱
        </button>
      )}

      {/* 菜谱卡片列表（可拖拽排序） */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragId(null)}
      >
        <SortableContext items={recipes.map(r => r.id)} strategy={verticalListSortingStrategy}>
          {recipes.map(recipe => (
            <SortableRecipeCard
              key={recipe.id}
              recipe={recipe}
              items={getRecipeItemsWithMatch(recipe.id)}
              onEditTitle={onEditRecipeTitle}
              onToggleActive={onToggleActive}
              onUndoCompletion={onUndoCompletion}
              onDelete={onDeleteRecipe}
              onAddItem={onCreateRecipeItem}
              onEditItem={onEditRecipeItem}
              onDeleteItem={onDeleteRecipeItem}
            />
          ))}
        </SortableContext>
        <DragOverlay>
          {activeDragRecipe ? (
            <RecipeCardPreview recipe={activeDragRecipe} itemCount={getRecipeItemsWithMatch(activeDragRecipe.id).length} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 空状态 */}
      {recipes.length === 0 && !showNewRecipe && (
        <div className="text-center py-16 text-sage-400">
          <ChefHat size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">还没有菜谱</p>
          <p className="text-xs mt-1">点击上方添加你的第一道菜</p>
        </div>
      )}

      {/* 底部提示 */}
      {recipes.length > 0 && (
        <div className="bg-grape-50 rounded-xl px-4 py-3 flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-grape-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
            i
          </div>
          <p className="text-xs text-grape-700">
            长按菜谱名称可拖拽排序 · 双击食材可修改 · 左滑删除
          </p>
        </div>
      )}
    </div>
  );
}

// ===== 拖拽预览卡片 =====

function RecipeCardPreview({ recipe, itemCount }: { recipe: Recipe; itemCount: number }) {
  return (
    <div className="bg-white rounded-2xl border border-grape-300 shadow-lg overflow-hidden">
      <div className="bg-cream-50 px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-grape-100 flex items-center justify-center shrink-0">
          <ChefHat size={16} className="text-grape-600" />
        </div>
        <span className="flex-1 text-sm font-bold text-sage-800">{recipe.title}</span>
        <span className="text-xs text-sage-400">{itemCount} 种食材</span>
      </div>
    </div>
  );
}

// ===== 可排序的菜谱卡片（useSortable + SwipeToDelete） =====

function SortableRecipeCard({
  recipe, items, onEditTitle, onToggleActive, onUndoCompletion, onDelete, onAddItem, onEditItem, onDeleteItem,
}: {
  recipe: Recipe;
  items: RecipeItemWithMatch[];
  onEditTitle: (id: string, title: string) => Promise<void>;
  onToggleActive: (id: string) => Promise<void>;
  onUndoCompletion: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddItem: (recipeId: string, name: string, quantity: string) => Promise<void>;
  onEditItem: (id: string, updates: { name?: string; quantity?: string }) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: recipe.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <SwipeToDelete onDelete={() => onDelete(recipe.id)}>
        <RecipeCard
          recipe={recipe}
          items={items}
          dragListeners={listeners}
          onEditTitle={onEditTitle}
          onToggleActive={onToggleActive}
          onUndoCompletion={onUndoCompletion}
          onAddItem={onAddItem}
          onEditItem={onEditItem}
          onDeleteItem={onDeleteItem}
        />
      </SwipeToDelete>
    </div>
  );
}

// ===== 菜谱卡片内容 =====

function RecipeCard({
  recipe, items, dragListeners, onEditTitle, onToggleActive, onUndoCompletion, onAddItem, onEditItem, onDeleteItem,
}: {
  recipe: Recipe;
  items: RecipeItemWithMatch[];
  dragListeners: ReturnType<typeof useSortable>['listeners'];
  onEditTitle: (id: string, title: string) => Promise<void>;
  onToggleActive: (id: string) => Promise<void>;
  onUndoCompletion: (id: string) => Promise<void>;
  onAddItem: (recipeId: string, name: string, quantity: string) => Promise<void>;
  onEditItem: (id: string, updates: { name?: string; quantity?: string }) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(recipe.title);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [expanded, setExpanded] = useState(true);
  const isActive = recipe.active !== false;

  // 菜谱变为已完成时自动折叠
  useEffect(() => {
    if (!isActive) setExpanded(false);
  }, [isActive]);

  const handleSaveTitle = async () => {
    if (titleValue.trim() && titleValue !== recipe.title) {
      await onEditTitle(recipe.id, titleValue.trim());
    } else {
      setTitleValue(recipe.title);
    }
    setEditingTitle(false);
  };

  const handleAddItem = async () => {
    if (!newName.trim()) return;
    await onAddItem(recipe.id, newName.trim(), newQty.trim());
    setNewName('');
    setNewQty('');
  };

  const matchedCount = items.filter(i => i.matchStatus === 'matched').length;

  return (
    <div id={`recipe-${recipe.id}`} className={`bg-white rounded-2xl border overflow-hidden transition-all duration-500 ${isActive ? 'border-sage-100' : 'border-sage-200 opacity-60'}`}>
      {/* 卡片头部（拖拽手柄） */}
      <div
        className="bg-cream-50 px-4 py-3 flex items-center gap-3 cursor-grab active:cursor-grabbing"
        {...dragListeners}
      >
        <div className="w-8 h-8 rounded-lg bg-grape-100 flex items-center justify-center shrink-0">
          <ChefHat size={16} className="text-grape-600" />
        </div>
        {editingTitle ? (
          <input
            type="text"
            value={titleValue}
            onChange={e => setTitleValue(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveTitle();
              if (e.key === 'Escape') { setTitleValue(recipe.title); setEditingTitle(false); }
            }}
            onPointerDown={e => e.stopPropagation()}
            autoFocus
            className="flex-1 px-2 py-1 rounded-lg bg-white border border-grape-400 text-sm font-medium focus:outline-none focus:border-grape-500"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            onPointerDown={e => e.stopPropagation()}
            className="flex-1 text-left text-sm font-bold text-sage-800 hover:text-grape-600 transition-colors"
          >
            {recipe.title}
          </button>
        )}
        {isActive && (
          <button
            onClick={() => setExpanded(e => !e)}
            onPointerDown={e => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-sage-400 hover:text-sage-600 shrink-0 transition-colors"
          >
            <span>{items.length} 种 · {matchedCount} 已有</span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
        {!isActive && (
          <button
            onClick={() => setExpanded(e => !e)}
            onPointerDown={e => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-sage-400 hover:text-sage-600 shrink-0 transition-colors"
          >
            <span>已结束</span>
            <span className="hidden sm:inline">{expanded ? '收起' : '查看明细'}</span>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
        {!isActive && (
          <button
            onClick={() => onUndoCompletion(recipe.id)}
            onPointerDown={e => e.stopPropagation()}
            title="撤销完成，恢复食材数量"
            className="h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-medium text-orange-500 hover:bg-orange-50 transition-colors shrink-0"
          >
            <Undo2 size={15} />
            <span className="hidden sm:inline">撤销</span>
          </button>
        )}
        <button
          className={`h-7 px-2 rounded-lg flex items-center gap-1 text-xs font-medium transition-colors shrink-0 ${
            isActive
              ? 'text-sage-400 hover:bg-sage-100 hover:text-sage-600'
              : 'text-grape-600 bg-grape-50 hover:bg-grape-100'
          }`}
        >
          {isActive ? <Check size={15} /> : <RotateCcw size={15} />}
          <span className="hidden sm:inline">{isActive ? '完成' : '再做'}</span>
        </button>
      </div>

      {/* 食材列表（仅激活且展开时显示，可双击编辑） */}
      {isActive && expanded && items.length > 0 && (
        <div className="px-3 py-2 space-y-1">
          {items.map(item => (
            <RecipeItemRow
              key={item.id}
              item={item}
              editable
              onEdit={onEditItem}
              onDelete={onDeleteItem}
            />
          ))}
        </div>
      )}

      {/* 添加食材栏（仅激活且展开时显示） */}
      {isActive && expanded && (
        <div className="px-3 pb-3 pt-1 flex items-center gap-2" onPointerDown={e => e.stopPropagation()}>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddItem()}
            placeholder="食材名称"
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-cream-100 border border-sage-100 text-sm focus:outline-none focus:border-grape-400"
          />
          <input
            type="text"
            value={newQty}
            onChange={e => setNewQty(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddItem()}
            placeholder="数量"
            className="w-20 px-3 py-1.5 rounded-lg bg-cream-100 border border-sage-100 text-sm focus:outline-none focus:border-grape-400"
          />
          <button
            onClick={handleAddItem}
            className="w-8 h-8 rounded-lg bg-grape-600 text-white flex items-center justify-center hover:bg-grape-700 transition-colors shrink-0"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      {/* 已完成菜谱明细（可展开查看，只读） */}
      {!isActive && expanded && items.length > 0 && (
        <div className="px-3 py-2 space-y-1 border-t border-sage-100">
          {items.map(item => (
            <RecipeItemRow
              key={item.id}
              item={item}
              editable={false}
              onEdit={onEditItem}
              onDelete={onDeleteItem}
            />
          ))}
        </div>
      )}

      {/* 已完成且无食材的提示 */}
      {!isActive && expanded && items.length === 0 && (
        <div className="px-3 py-3 text-center text-xs text-sage-400 border-t border-sage-100">
          这道菜没有记录食材
        </div>
      )}
    </div>
  );
}

// ===== 菜谱食材行（可双击编辑 + 左滑删除） =====

function RecipeItemRow({
  item, editable, onEdit, onDelete,
}: {
  item: RecipeItemWithMatch;
  editable: boolean;
  onEdit: (id: string, updates: { name?: string; quantity?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editQty, setEditQty] = useState(item.quantity);

  const handleSaveEdit = async () => {
    const updates: { name?: string; quantity?: string } = {};
    if (editName.trim() && editName !== item.name) updates.name = editName.trim();
    if (editQty.trim() !== item.quantity) updates.quantity = editQty.trim();
    if (Object.keys(updates).length > 0) {
      await onEdit(item.id, updates);
    } else {
      setEditName(item.name);
      setEditQty(item.quantity);
    }
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(item.name);
    setEditQty(item.quantity);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-grape-50">
        <input
          type="text"
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSaveEdit();
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
            if (e.key === 'Enter') handleSaveEdit();
            if (e.key === 'Escape') handleCancelEdit();
          }}
          className="w-20 px-2 py-1 rounded-lg bg-white border border-grape-400 text-sm focus:outline-none focus:border-grape-500"
        />
        <button
          onClick={handleSaveEdit}
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
    );
  }

  return (
    <SwipeToDelete onDelete={() => onDelete(item.id)}>
      <div
        className={`flex items-center gap-3 px-2 py-2 rounded-lg ${
          item.matchStatus === 'to_buy' ? 'bg-red-50' : 'bg-cream-50'
        } ${editable ? 'cursor-pointer' : ''}`}
        onDoubleClick={editable ? () => setEditing(true) : undefined}
      >
        <span className="text-sm text-sage-800 flex-1">{item.name}</span>
        <span className="text-sm text-sage-500">{item.quantity}</span>
        {item.matchStatus === 'matched' ? (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-sage-100 text-xs text-sage-700 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-sage-500" />
            已有
          </span>
        ) : (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-xs text-red-700 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            待购买
          </span>
        )}
      </div>
    </SwipeToDelete>
  );
}
