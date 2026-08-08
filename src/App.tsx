import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useMeals } from './hooks/useMeals';
import { usePantryCooking } from './hooks/usePantryCooking';
import type { ViewMode, MealData } from './types';
import AuthForm from './components/AuthForm';
import Header from './components/Header';
import CalendarView from './components/CalendarView';
import ListView from './components/ListView';
import StatsView from './components/StatsView';
import AddMealModal from './components/AddMealModal';
import PantryView from './components/PantryView';
import CookingView from './components/CookingView';
import { Loader2, Undo2 } from 'lucide-react';

// hash ↔ 视图映射
function viewToHash(view: ViewMode): string {
  if (view === 'pantry') return '#pantry';
  if (view === 'cooking') return '#cooking';
  return '';
}
function hashToView(hash: string): ViewMode | null {
  if (hash === '#pantry' || hash === '#/pantry') return 'pantry';
  if (hash === '#cooking' || hash === '#/cooking') return 'cooking';
  return null;
}

function App() {
  const { user, loading: authLoading, isDemo, signUp, signIn, signOut, setDemoMode } = useAuth();
  const { meals, loading: mealsLoading, createMeal, removeMeal } = useMeals(user?.id, isDemo);
  const pantryCooking = usePantryCooking(user?.id, isDemo);
  const { undoInfo, undo } = pantryCooking;
  const [showUndoToast, setShowUndoToast] = useState(false);

  // undoInfo 变化时显示 toast，5 秒后自动隐藏
  useEffect(() => {
    if (undoInfo) {
      setShowUndoToast(true);
      const timer = setTimeout(() => setShowUndoToast(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowUndoToast(false);
    }
  }, [undoInfo]);

  const handleUndo = async () => {
    setShowUndoToast(false);
    await undo();
  };
  const [currentView, setCurrentView] = useState<ViewMode>(() => {
    return hashToView(window.location.hash) || 'calendar';
  });
  const [showAddModal, setShowAddModal] = useState(false);

  // 切换视图时同步 URL hash
  const handleChangeView = (view: ViewMode) => {
    setCurrentView(view);
    const hash = viewToHash(view);
    if (hash) {
      window.location.hash = hash;
    } else if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  // 监听浏览器前进/后退
  useEffect(() => {
    const onHashChange = () => {
      const view = hashToView(window.location.hash);
      if (view) setCurrentView(view);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // 在新标签页打开指定视图
  const openInNewTab = (view: ViewMode) => {
    const hash = viewToHash(view);
    const url = window.location.origin + window.location.pathname + window.location.search + hash;
    window.open(url, '_blank');
  };

  const handleAddMeal = async (meal: MealData) => {
    await createMeal(meal);
  };

  // 从食材库跳转到做菜界面（可指定某个菜谱）
  const navigateToCooking = (recipeId?: string) => {
    handleChangeView('cooking');
    // recipeId 可用于后续滚动定位，暂存
    if (recipeId) {
      // 使用 setTimeout 确保 DOM 已渲染
      setTimeout(() => {
        const el = document.getElementById(`recipe-${recipeId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-grape-400');
          setTimeout(() => el.classList.remove('ring-2', 'ring-grape-400'), 2000);
        }
      }, 100);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-sage-500" />
      </div>
    );
  }

  if (!user) {
    return <AuthForm onSignIn={signIn} onSignUp={signUp} onDemo={setDemoMode} />;
  }

  const isPantryView = currentView === 'pantry' || currentView === 'cooking';

  return (
    <div className="min-h-screen bg-cream-100">
      <Header
        userEmail={user.email || ''}
        onSignOut={signOut}
        currentView={currentView}
        onChangeView={handleChangeView}
        onAddClick={() => setShowAddModal(true)}
        onOpenInNewTab={() => openInNewTab(currentView)}
      />

      <main className={`mx-auto px-4 py-6 ${isPantryView ? 'max-w-3xl' : 'max-w-5xl'}`}>
        {isPantryView ? (
          pantryCooking.loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-grape-500" />
            </div>
          ) : currentView === 'pantry' ? (
            <PantryView
              pantryItems={pantryCooking.pantryItems}
              getPantryDisplay={pantryCooking.getPantryDisplay}
              onCreatePantryItem={pantryCooking.createPantryItem}
              onEditPantryItem={pantryCooking.editPantryItem}
              onToggleChecked={pantryCooking.toggleChecked}
              onConvertToBuy={pantryCooking.convertToBuyToActive}
              onDeletePantryItem={pantryCooking.removePantryItem}
              onReorder={pantryCooking.reorderPantryItems}
              onReorderBatch={pantryCooking.reorderPantryItemsBatch}
              onSetCategory={pantryCooking.setPantryCategory}
              onSetCategoryBatch={pantryCooking.setPantryCategoryBatch}
              onNavigateToRecipe={(recipeId) => navigateToCooking(recipeId)}
              onNavigateToCooking={() => navigateToCooking()}
              onOpenCookingInNewTab={() => openInNewTab('cooking')}
            />
          ) : (
            <CookingView
              recipes={pantryCooking.recipes}
              getRecipeItemsWithMatch={pantryCooking.getRecipeItemsWithMatch}
              onCreateRecipe={pantryCooking.createRecipe}
              onEditRecipeTitle={pantryCooking.editRecipeTitle}
              onToggleActive={pantryCooking.toggleRecipeActive}
              onDeleteRecipe={pantryCooking.removeRecipe}
              onCreateRecipeItem={pantryCooking.createRecipeItem}
              onEditRecipeItem={pantryCooking.editRecipeItem}
              onDeleteRecipeItem={pantryCooking.removeRecipeItem}
              onReorderRecipes={pantryCooking.reorderRecipes}
              onNavigateToPantry={() => setCurrentView('pantry')}
            />
          )
        ) : (
          mealsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-sage-500" />
            </div>
          ) : (
            <>
              {currentView === 'calendar' && <CalendarView meals={meals} onDelete={removeMeal} />}
              {currentView === 'list' && <ListView meals={meals} onDelete={removeMeal} />}
              {currentView === 'stats' && <StatsView meals={meals} />}
            </>
          )
        )}
      </main>

      {showAddModal && (
        <AddMealModal
          userId={user.id}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddMeal}
        />
      )}

      {/* Undo Toast */}
      {showUndoToast && undoInfo && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <button
            onClick={handleUndo}
            className="flex items-center gap-2 px-4 py-2.5 bg-grape-600 text-white rounded-full shadow-lg hover:bg-grape-700 transition-colors text-sm"
          >
            <Undo2 size={16} />
            <span>撤销 · {undoInfo}</span>
            <kbd className="px-1.5 py-0.5 bg-grape-700/50 rounded text-xs">⌘Z</kbd>
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
