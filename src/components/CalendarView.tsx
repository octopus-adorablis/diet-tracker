import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Utensils } from 'lucide-react';
import type { MealData } from '../types';
import { groupMealsByDate, getMealTypeColor, getMonthYear } from '../lib/utils';
import MealDetailModal from './MealDetailModal';

interface CalendarViewProps {
  meals: MealData[];
  onDelete?: (mealId: string) => void;
}

export default function CalendarView({ meals, onDelete }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const mealsByDate = useMemo(() => groupMealsByDate(meals), [meals]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const today = new Date();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDayClick = (dateStr: string) => {
    if (mealsByDate[dateStr]?.length > 0) {
      setSelectedDate(dateStr);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-sage-800">{getMonthYear(currentDate)}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="w-10 h-10 rounded-xl bg-white border border-sage-200 text-sage-600 flex items-center justify-center hover:bg-sage-50 hover:border-sage-300 transition-all shadow-sm"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-4 h-10 rounded-xl bg-white border border-sage-200 text-sage-600 text-sm font-medium hover:bg-sage-50 hover:border-sage-300 transition-all shadow-sm"
          >
            今天
          </button>
          <button
            onClick={handleNextMonth}
            className="w-10 h-10 rounded-xl bg-white border border-sage-200 text-sage-600 flex items-center justify-center hover:bg-sage-50 hover:border-sage-300 transition-all shadow-sm"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-3xl border border-sage-100 shadow-sm p-4 sm:p-6">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
          {weekdays.map(day => (
            <div key={day} className="text-center text-xs font-semibold text-sage-400 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {/* Empty cells */}
          {Array.from({ length: startPadding }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayMeals = mealsByDate[dateStr] || [];
            const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
            const hasMeals = dayMeals.length > 0;

            return (
              <button
                key={day}
                onClick={() => handleDayClick(dateStr)}
                className={`aspect-square rounded-xl sm:rounded-2xl p-1 sm:p-2 flex flex-col items-center justify-start transition-all ${
                  hasMeals
                    ? 'bg-cream-50 hover:bg-cream-100 cursor-pointer'
                    : 'hover:bg-sage-50'
                } ${isToday ? 'ring-2 ring-sage-400 ring-offset-1' : ''}`}
              >
                <span className={`text-sm font-semibold mb-1 ${isToday ? 'text-sage-700' : 'text-sage-600'}`}>
                  {day}
                </span>
                {hasMeals && (
                  <div className="flex flex-col gap-0.5 w-full items-center">
                    {dayMeals.slice(0, 3).map((meal, idx) => (
                      <span
                        key={idx}
                        className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md ${getMealTypeColor(meal.type)}`}
                      >
                        {meal.typeName}
                      </span>
                    ))}
                    {dayMeals.length > 3 && (
                      <span className="text-[9px] text-sage-400">+{dayMeals.length - 3}</span>
                    )}
                  </div>
                )}
                {!hasMeals && (
                  <Utensils size={14} className="text-sage-200 mt-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="bg-white rounded-2xl border border-sage-100 p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-sage-800">{meals.length}</div>
          <div className="text-xs text-sage-500 mt-1">记录餐数</div>
        </div>
        <div className="bg-white rounded-2xl border border-sage-100 p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-sage-800">
            {Object.keys(mealsByDate).length}
          </div>
          <div className="text-xs text-sage-500 mt-1">记录天数</div>
        </div>
        <div className="bg-white rounded-2xl border border-sage-100 p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-sage-800">
            {meals.length > 0
              ? (meals.reduce((sum, m) => sum + (m.evaluation?.score || 0), 0) / meals.length).toFixed(1)
              : '0'}
          </div>
          <div className="text-xs text-sage-500 mt-1">平均评分</div>
        </div>
      </div>

      {/* Modal */}
      {selectedDate && mealsByDate[selectedDate] && (
        <MealDetailModal
          date={selectedDate}
          meals={mealsByDate[selectedDate!]}
          onClose={() => setSelectedDate(null)}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
