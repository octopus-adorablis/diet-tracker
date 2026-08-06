import { useState } from 'react';
import { Plus, X, ChefHat, ArrowLeft } from 'lucide-react';
import type { Recipe, RecipeItemWithMatch } from '../types';

interface CookingViewProps {
  recipes: Recipe[];
  getRecipeItemsWithMatch: (recipeId: string) => RecipeItemWithMatch[];
  onCreateRecipe: (title: string) => Promise<Recipe | null>;
  onEditRecipeTitle: (id: string, title: string) => Promise<void>;
  onDeleteRecipe: (id: string) => Promise<void>;
  onCreateRecipeItem: (recipeId: string, name: string, quantity: string) => Promise<void>;
  onDeleteRecipeItem: (id: string) => Promise<void>;
  onNavigateToPantry: () => void;
}

export default function CookingView({
  recipes, getRecipeItemsWithMatch,
  onCreateRecipe, onEditRecipeTitle, onDeleteRecipe,
  onCreateRecipeItem, onDeleteRecipeItem, onNavigateToPantry,
}: CookingViewProps) {
  const [showNewRecipe, setShowNewRecipe] = useState(false);
  const [newRecipeTitle, setNewRecipeTitle] = useState('');

  const handleCreateRecipe = async () => {
    if (!newRecipeTitle.trim()) return;
    await onCreateRecipe(newRecipeTitle.trim());
    setNewRecipeTitle('');
    setShowNewRecipe(false);
  };

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
            <p className="text-xs text-sage-500">记录每道菜的用料 · 自动匹配食材库</p>
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

      {/* 菜谱卡片列表 */}
      {recipes.map(recipe => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          items={getRecipeItemsWithMatch(recipe.id)}
          onEditTitle={onEditRecipeTitle}
          onDelete={onDeleteRecipe}
          onAddItem={onCreateRecipeItem}
          onDeleteItem={onDeleteRecipeItem}
        />
      ))}

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
            未匹配的食材会自动加入食材库的待购买清单
          </p>
        </div>
      )}
    </div>
  );
}

// ===== 菜谱卡片 =====

function RecipeCard({
  recipe, items, onEditTitle, onDelete, onAddItem, onDeleteItem,
}: {
  recipe: Recipe;
  items: RecipeItemWithMatch[];
  onEditTitle: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddItem: (recipeId: string, name: string, quantity: string) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(recipe.title);
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');

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
    <div id={`recipe-${recipe.id}`} className="bg-white rounded-2xl border border-sage-100 overflow-hidden transition-all duration-500">
      {/* 卡片头部 */}
      <div className="bg-cream-50 px-4 py-3 flex items-center gap-3">
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
            autoFocus
            className="flex-1 px-2 py-1 rounded-lg bg-white border border-grape-400 text-sm font-medium focus:outline-none focus:border-grape-500"
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="flex-1 text-left text-sm font-bold text-sage-800 hover:text-grape-600 transition-colors"
          >
            {recipe.title}
          </button>
        )}
        <span className="text-xs text-sage-400 shrink-0">
          {items.length} 种食材 · {matchedCount} 已有
        </span>
        <button
          onClick={() => onDelete(recipe.id)}
          className="w-7 h-7 rounded-lg text-sage-300 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* 食材列表 */}
      {items.length > 0 && (
        <div className="px-3 py-2 space-y-1">
          {items.map(item => (
            <div
              key={item.id}
              className={`flex items-center gap-3 px-2 py-2 rounded-lg ${
                item.matchStatus === 'to_buy' ? 'bg-red-50' : 'bg-cream-50'
              }`}
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
              <button
                onClick={() => onDeleteItem(item.id)}
                className="w-6 h-6 rounded text-sage-300 hover:bg-sage-100 hover:text-sage-500 flex items-center justify-center transition-colors shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 添加食材栏 */}
      <div className="px-3 pb-3 pt-1 flex items-center gap-2">
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
    </div>
  );
}
