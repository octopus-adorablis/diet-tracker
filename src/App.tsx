import { useState } from 'react';
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
import { Loader2 } from 'lucide-react';

function App() {
  const { user, loading: authLoading, isDemo, signUp, signIn, signOut, setDemoMode } = useAuth();
  const { meals, loading: mealsLoading, createMeal, removeMeal } = useMeals(user?.id, isDemo);
  const pantryCooking = usePantryCooking(user?.id, isDemo);
  const [currentView, setCurrentView] = useState<ViewMode>('calendar');
  const [showAddModal, setShowAddModal] = useState(false);

  const handleAddMeal = async (meal: MealData) => {
    await createMeal(meal);
  };

  // 从食材库跳转到做菜界面（可指定某个菜谱）
  const navigateToCooking = (recipeId?: string) => {
    setCurrentView('cooking');
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
        onChangeView={setCurrentView}
        onAddClick={() => setShowAddModal(true)}
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
              getPantryUsage={pantryCooking.getPantryUsage}
              onCreatePantryItem={pantryCooking.createPantryItem}
              onToggleChecked={pantryCooking.toggleChecked}
              onConvertToBuy={pantryCooking.convertToBuyToActive}
              onDeletePantryItem={pantryCooking.removePantryItem}
              onNavigateToRecipe={(recipeId) => navigateToCooking(recipeId)}
              onNavigateToCooking={() => navigateToCooking()}
            />
          ) : (
            <CookingView
              recipes={pantryCooking.recipes}
              getRecipeItemsWithMatch={pantryCooking.getRecipeItemsWithMatch}
              onCreateRecipe={pantryCooking.createRecipe}
              onEditRecipeTitle={pantryCooking.editRecipeTitle}
              onDeleteRecipe={pantryCooking.removeRecipe}
              onCreateRecipeItem={pantryCooking.createRecipeItem}
              onDeleteRecipeItem={pantryCooking.removeRecipeItem}
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
    </div>
  );
}

export default App;
