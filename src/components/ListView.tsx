import { useMemo } from 'react';
import type { MealData } from '../types';
import MealCard from './MealCard';
import { Utensils } from 'lucide-react';

interface ListViewProps {
  meals: MealData[];
  onDelete?: (mealId: string) => void;
}

export default function ListView({ meals, onDelete }: ListViewProps) {
  const sortedMeals = useMemo(() => {
    return [...meals].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.time.localeCompare(b.time);
    });
  }, [meals]);

  if (sortedMeals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-sage-100 flex items-center justify-center mb-4">
          <Utensils size={32} className="text-sage-300" />
        </div>
        <p className="text-sage-500 text-lg font-medium">还没有记录任何餐食</p>
        <p className="text-sage-400 text-sm mt-1">点击右上角的 + 按钮开始记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {sortedMeals.map(meal => (
        <MealCard key={meal.id || `${meal.date}-${meal.time}-${meal.content}`} meal={meal} showDate onDelete={onDelete} />
      ))}
    </div>
  );
}
