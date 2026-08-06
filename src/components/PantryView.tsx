import { useState } from 'react';
import { Plus, Circle, CheckCircle, X, ChefHat, ShoppingCart } from 'lucide-react';
import type { PantryItem, PantryUsage, PantryStatus } from '../types';

interface PantryViewProps {
  pantryItems: PantryItem[];
  getPantryUsage: (id: string) => PantryUsage[];
  onCreatePantryItem: (name: string, quantity: string, status: PantryStatus) => Promise<void>;
  onToggleChecked: (id: string) => Promise<void>;
  onConvertToBuy: (id: string, quantity: string) => Promise<void>;
  onNavigateToRecipe: (recipeId: string) => void;
  onNavigateToCooking: () => void;
}

export default function PantryView({
  pantryItems, getPantryUsage, onCreatePantryItem, onToggleChecked, onConvertToBuy,
  onNavigateToRecipe, onNavigateToCooking,
}: PantryViewProps) {
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState('');
  const [showChecked, setShowChecked] = useState(false);
  const [buyDialogItem, setBuyDialogItem] = useState<PantryItem | null>(null);
  const [buyQty, setBuyQty] = useState('');

  const activeItems = pantryItems.filter(p => p.status === 'active');
  const toBuyItems = pantryItems.filter(p => p.status === 'to_buy');
  const checkedItems = pantryItems.filter(p => p.status === 'checked');

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
        <button
          onClick={onNavigateToCooking}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-grape-600 text-white text-sm font-medium hover:bg-grape-700 transition-colors shadow-sm"
        >
          <ChefHat size={16} />
          做菜
        </button>
      </div>

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

      {/* 现有食材 */}
      {activeItems.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-medium text-sage-500 tracking-wider">现有食材</span>
            <span className="text-xs text-sage-400">{activeItems.length} 项</span>
          </div>
          <div className="space-y-2">
            {activeItems.map(item => (
              <PantryItemCard
                key={item.id}
                item={item}
                usages={getPantryUsage(item.id)}
                onToggleChecked={onToggleChecked}
                onNavigateToRecipe={onNavigateToRecipe}
              />
            ))}
          </div>
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

// ===== 现有食材卡片 =====

function PantryItemCard({
  item, usages, onToggleChecked, onNavigateToRecipe,
}: {
  item: PantryItem;
  usages: PantryUsage[];
  onToggleChecked: (id: string) => void;
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
  item, usages, onBuyClick, onNavigateToRecipe,
}: {
  item: PantryItem;
  usages: PantryUsage[];
  onBuyClick: (item: PantryItem) => void;
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
