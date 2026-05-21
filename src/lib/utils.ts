import type { MealData } from '../types';

export function groupMealsByDate(meals: MealData[]): Record<string, MealData[]> {
  return meals.reduce((acc, meal) => {
    if (!acc[meal.date]) {
      acc[meal.date] = [];
    }
    acc[meal.date].push(meal);
    return acc;
  }, {} as Record<string, MealData[]>);
}

export function getMealTypeColor(type: string): string {
  switch (type) {
    case 'breakfast':
      return 'bg-gold-400 text-white';
    case 'lunch':
      return 'bg-terra-400 text-white';
    case 'dinner':
      return 'bg-ocean-400 text-white';
    case 'snack':
      return 'bg-sage-400 text-white';
    default:
      return 'bg-sage-400 text-white';
  }
}

export function getMealTypeBorderColor(type: string): string {
  switch (type) {
    case 'breakfast':
      return 'border-l-gold-400';
    case 'lunch':
      return 'border-l-terra-400';
    case 'dinner':
      return 'border-l-ocean-400';
    case 'snack':
      return 'border-l-sage-400';
    default:
      return 'border-l-sage-400';
  }
}

export function getMealTypeBgColor(type: string): string {
  switch (type) {
    case 'breakfast':
      return 'bg-gold-50 text-gold-600';
    case 'lunch':
      return 'bg-terra-50 text-terra-600';
    case 'dinner':
      return 'bg-ocean-50 text-ocean-600';
    case 'snack':
      return 'bg-sage-50 text-sage-600';
    default:
      return 'bg-sage-50 text-sage-600';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'good':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'warning':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'danger':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-sage-50 text-sage-700 border-sage-200';
  }
}

export function getScoreBadgeColor(score: number): string {
  if (score >= 8) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (score >= 6) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}

export function getMonthYear(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function getWeekRange(date: Date): { start: Date; end: Date } {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(date.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function isSameMonth(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth();
}

