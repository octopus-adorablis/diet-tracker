import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useMeals } from './hooks/useMeals';
import type { ViewMode, MealData } from './types';
import AuthForm from './components/AuthForm';
import Header from './components/Header';
import CalendarView from './components/CalendarView';
import ListView from './components/ListView';
import StatsView from './components/StatsView';
import AddMealModal from './components/AddMealModal';
import { Loader2 } from 'lucide-react';

function App() {
  const { user, loading: authLoading, isDemo, signUp, signIn, signOut, setDemoMode } = useAuth();
  const { meals, loading: mealsLoading, createMeal, removeMeal } = useMeals(user?.id, isDemo);
  const [currentView, setCurrentView] = useState<ViewMode>('calendar');
  const [showAddModal, setShowAddModal] = useState(false);

  const handleAddMeal = async (meal: MealData) => {
    await createMeal(meal);
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

  return (
    <div className="min-h-screen bg-cream-100">
      <Header
        userEmail={user.email || ''}
        onSignOut={signOut}
        currentView={currentView}
        onChangeView={setCurrentView}
        onAddClick={() => setShowAddModal(true)}
      />

      <main className="max-w-5xl mx-auto px-4 py-6">
        {mealsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-sage-500" />
          </div>
        ) : (
          <>
            {currentView === 'calendar' && <CalendarView meals={meals} onDelete={removeMeal} />}
            {currentView === 'list' && <ListView meals={meals} onDelete={removeMeal} />}
            {currentView === 'stats' && <StatsView meals={meals} />}
          </>
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
