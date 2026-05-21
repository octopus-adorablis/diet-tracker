import { useState } from 'react';
import { ChevronDown, Flame, Dumbbell, Wheat, Droplets, Leaf, Sparkles, Lightbulb, AlertTriangle, BarChart3, X } from 'lucide-react';
import type { MealData } from '../types';
import { getMealTypeBgColor, getMealTypeBorderColor, getStatusColor, getScoreBadgeColor, formatDate } from '../lib/utils';

interface MealCardProps {
  meal: MealData;
  showDate?: boolean;
  onDelete?: (mealId: string) => void;
}

export default function MealCard({ meal, showDate = false, onDelete }: MealCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ev = meal.evaluation || {
    score: 0,
    scoreLabel: '待分析',
    items: [],
    highlights: [],
    suggestions: [],
  };

  const iconMap: Record<string, typeof Flame> = {
    '🔥': Flame,
    '💪': Dumbbell,
    '🍞': Wheat,
    '🥑': Droplets,
    '🌿': Leaf,
  };

  return (
    <div className={`bg-white rounded-2xl border border-sage-100 overflow-hidden card-hover ${getMealTypeBorderColor(meal.type)} border-l-4`}>
      {/* Header */}
      <div
        className="p-5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {showDate && (
              <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-sage-500 text-white">
                <span className="text-lg font-bold leading-none">{new Date(meal.date + 'T00:00:00').getDate()}</span>
                <span className="text-[10px] leading-none mt-0.5">{new Date(meal.date + 'T00:00:00').getMonth() + 1}月</span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getMealTypeBgColor(meal.type)}`}>
                  {meal.typeName}
                </span>
                <span className="text-xs text-sage-400">{meal.time}</span>
                {showDate && (
                  <span className="text-xs text-sage-400">{formatDate(meal.date)}</span>
                )}
              </div>
              <p className="text-sage-800 font-medium text-sm">{meal.content}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                className="w-7 h-7 rounded-lg hover:bg-rose-50 flex items-center justify-center text-sage-400 hover:text-rose-500 transition-all"
                title="删除此记录"
              >
                <X size={15} />
              </button>
            )}
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${getScoreBadgeColor(ev.score)}`}>
              {ev.score}分
            </span>
            <ChevronDown
              size={18}
              className={`text-sage-400 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
            />
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 mt-3 text-xs text-sage-500">
          <span className="flex items-center gap-1">
            <Flame size={13} className="text-terra-400" />
            {meal.total.calories} kcal
          </span>
          <span className="flex items-center gap-1">
            <Dumbbell size={13} className="text-ocean-400" />
            {meal.total.protein}g 蛋白
          </span>
          <span className="flex items-center gap-1">
            <Wheat size={13} className="text-gold-400" />
            {meal.total.carbs}g 碳水
          </span>
        </div>
      </div>

      {/* Expanded Content */}
      <div className={`overflow-hidden transition-all duration-400 ${expanded ? 'max-h-[2000px]' : 'max-h-0'}`}>
        <div className="px-5 pb-5 space-y-5">
          {/* Nutrition Table */}
          <div>
            <h4 className="text-sm font-semibold text-sage-700 mb-3 flex items-center gap-2">
              <Sparkles size={16} className="text-gold-500" />
              食材与营养
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-sage-500 border-b border-sage-100">
                    <th className="text-left py-2 px-2 font-medium">食材</th>
                    <th className="text-right py-2 px-2 font-medium">重量</th>
                    <th className="text-right py-2 px-2 font-medium">热量</th>
                    <th className="text-right py-2 px-2 font-medium">碳水</th>
                    <th className="text-right py-2 px-2 font-medium">蛋白</th>
                    <th className="text-right py-2 px-2 font-medium">脂肪</th>
                    <th className="text-right py-2 px-2 font-medium">纤维</th>
                    <th className="text-left py-2 px-2 font-medium">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {meal.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-sage-50 last:border-0">
                      <td className="py-2 px-2 text-sage-800 font-medium">{item.name}</td>
                      <td className="py-2 px-2 text-right text-sage-600">{item.weight}g</td>
                      <td className="py-2 px-2 text-right text-sage-600">{item.calories}</td>
                      <td className="py-2 px-2 text-right text-sage-600">{item.carbs}</td>
                      <td className="py-2 px-2 text-right text-sage-600">{item.protein}</td>
                      <td className="py-2 px-2 text-right text-sage-600">{item.fat}</td>
                      <td className="py-2 px-2 text-right text-sage-600">{item.fiber}</td>
                      <td className="py-2 px-2 text-sage-400 text-xs">{item.note || '-'}</td>
                    </tr>
                  ))}
                  <tr className="bg-sage-50 font-semibold">
                    <td className="py-2.5 px-2 text-sage-800">合计</td>
                    <td className="py-2.5 px-2 text-right text-sage-700">-</td>
                    <td className="py-2.5 px-2 text-right text-sage-700">{meal.total.calories}</td>
                    <td className="py-2.5 px-2 text-right text-sage-700">{meal.total.carbs}</td>
                    <td className="py-2.5 px-2 text-right text-sage-700">{meal.total.protein}</td>
                    <td className="py-2.5 px-2 text-right text-sage-700">{meal.total.fat}</td>
                    <td className="py-2.5 px-2 text-right text-sage-700">{meal.total.fiber}</td>
                    <td className="py-2.5 px-2"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Evaluation */}
          <div>
            <h4 className="text-sm font-semibold text-sage-700 mb-3 flex items-center gap-2">
              <BarChart3 size={16} className="text-ocean-500" />
              营养均衡度评估
            </h4>
            <div className="space-y-2">
              {ev.items.map((item, idx) => {
                const IconComponent = iconMap[item.icon] || AlertTriangle;
                return (
                  <div key={idx} className="flex items-center gap-3 py-2 border-b border-sage-50 last:border-0">
                    <IconComponent size={18} className="text-sage-400 flex-shrink-0" />
                    <span className="flex-1 text-sm text-sage-700">
                      {item.name}：{item.value}（目标：{item.target}）
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(item.status)}`}>
                      {item.statusText}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Highlights */}
          {ev.highlights.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-sage-700 mb-3 flex items-center gap-2">
                <Sparkles size={16} className="text-gold-500" />
                这一餐的亮点
              </h4>
              <ul className="space-y-2">
                {ev.highlights.map((h, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-sage-600">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {ev.suggestions.length > 0 && (
            <div className="bg-terra-50 rounded-xl p-4 border border-terra-100">
              <h4 className="text-sm font-semibold text-terra-700 mb-3 flex items-center gap-2">
                <Lightbulb size={16} />
                优化建议
              </h4>
              <ul className="space-y-2">
                {ev.suggestions.map((s, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-terra-800">
                    <span className="text-terra-500 mt-0.5">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* 删除确认 */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-sage-900/50 backdrop-blur-sm animate-fade-in"
          onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-2xl p-6 max-w-xs w-full mx-4 shadow-2xl animate-slide-up">
            <h4 className="text-lg font-bold text-sage-800 mb-2">确认删除</h4>
            <p className="text-sm text-sage-600 mb-5">
              确定要删除「{meal.typeName} - {meal.content}」这条记录吗？此操作不可撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(false); }}
                className="flex-1 py-2.5 rounded-xl border border-sage-200 text-sage-700 font-medium hover:bg-sage-50 transition-all"
              >
                取消
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  setConfirmDelete(false);
                  onDelete?.(meal.id!);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white font-medium hover:bg-rose-600 transition-all"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

