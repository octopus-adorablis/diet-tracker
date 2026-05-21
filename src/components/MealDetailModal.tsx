import { X } from 'lucide-react';
import type { MealData } from '../types';
import { formatDate } from '../lib/utils';
import MealCard from './MealCard';

interface MealDetailModalProps {
  date: string;
  meals: MealData[];
  onClose: () => void;
  onDelete?: (mealId: string) => void;
}

export default function MealDetailModal({ date, meals, onClose, onDelete }: MealDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sage-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-cream-100 rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="sticky top-0 bg-cream-100/90 backdrop-blur-md px-6 py-4 border-b border-sage-100 flex items-center justify-between z-10">
          <h3 className="text-xl font-bold text-sage-800">{formatDate(date)}</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white border border-sage-200 text-sage-500 flex items-center justify-center hover:bg-sage-50 hover:text-sage-700 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Meals */}
        <div className="p-6 space-y-4">
          {meals.map(meal => (
            <MealCard key={meal.id || `${meal.date}-${meal.time}`} meal={meal} onDelete={onDelete} />
          ))}
        </div>
      </div>
    </div>
  );
}
