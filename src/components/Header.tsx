import { Leaf, LogOut, User, CalendarDays, List, BarChart3, Plus, ChefHat, ExternalLink } from 'lucide-react';
import type { ViewMode } from '../types';

interface HeaderProps {
  userEmail: string;
  onSignOut: () => void;
  currentView: ViewMode;
  onChangeView: (view: ViewMode) => void;
  onAddClick: () => void;
  onOpenInNewTab: () => void;
}

export default function Header({ userEmail, onSignOut, currentView, onChangeView, onAddClick, onOpenInNewTab }: HeaderProps) {
  const tabs: { id: ViewMode; label: string; icon: typeof CalendarDays }[] = [
    { id: 'calendar', label: '日历', icon: CalendarDays },
    { id: 'list', label: '列表', icon: List },
    { id: 'stats', label: '统计', icon: BarChart3 },
    { id: 'pantry', label: '食材库', icon: ChefHat },
  ];

  // pantry 和 cooking 视图都高亮"食材库"标签
  const activeTab = currentView === 'cooking' ? 'pantry' : currentView;
  const showAddButton = currentView !== 'pantry' && currentView !== 'cooking';
  const showNewTabButton = currentView === 'pantry' || currentView === 'cooking';

  return (
    <header className="sticky top-0 z-50 glass border-b border-sage-100">
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sage-500 text-white flex items-center justify-center shadow-md shadow-sage-500/20">
              <Leaf size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-sage-800 leading-tight">饮食记录</h1>
              <p className="text-[10px] text-sage-500 leading-tight">Diet Tracker</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex items-center bg-cream-200/80 rounded-xl p-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onChangeView(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-white text-sage-700 shadow-sm'
                      : 'text-sage-500 hover:text-sage-700'
                  }`}
                >
                  <Icon size={16} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {showNewTabButton && (
              <button
                onClick={onOpenInNewTab}
                className="h-9 px-3 rounded-xl bg-grape-100 text-grape-600 flex items-center gap-1.5 hover:bg-grape-200 transition-colors text-sm font-medium"
                title="在新标签页打开"
              >
                <ExternalLink size={16} />
                <span className="hidden sm:inline">新标签页</span>
              </button>
            )}
            {showAddButton && (
              <button
                onClick={onAddClick}
                className="w-9 h-9 rounded-xl bg-terra-500 text-white flex items-center justify-center hover:bg-terra-600 active:bg-terra-700 transition-colors shadow-md shadow-terra-500/20"
                title="添加记录"
              >
                <Plus size={20} />
              </button>
            )}
            <div className="hidden sm:flex items-center gap-2 text-sm text-sage-600">
              <User size={16} className="text-sage-400" />
              <span className="max-w-[120px] truncate">{userEmail}</span>
            </div>
            <button
              onClick={onSignOut}
              className="w-9 h-9 rounded-xl bg-sage-100 text-sage-500 flex items-center justify-center hover:bg-sage-200 hover:text-sage-700 transition-colors"
              title="退出登录"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
