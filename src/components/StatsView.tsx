import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Download, TrendingUp, Flame, Dumbbell, Wheat, Droplets, Leaf } from 'lucide-react';
import type { MealData } from '../types';
import { getWeekRange, isSameMonth } from '../lib/utils';
import { exportMealsToExcel } from '../lib/export';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface StatsViewProps {
  meals: MealData[];
}

type PeriodType = 'week' | 'month';

export default function StatsView({ meals }: StatsViewProps) {
  const [period, setPeriod] = useState<PeriodType>('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  const filteredMeals = useMemo(() => {
    if (period === 'week') {
      const { start, end } = getWeekRange(currentDate);
      return meals.filter(m => {
        const d = new Date(m.date + 'T00:00:00');
        return d >= start && d <= end;
      });
    } else {
      return meals.filter(m => {
        const d = new Date(m.date + 'T00:00:00');
        return isSameMonth(d, currentDate);
      });
    }
  }, [meals, period, currentDate]);

  const stats = useMemo(() => {
    if (filteredMeals.length === 0) return null;

    const totalMeals = filteredMeals.length;
    const avgCalories = Math.round(filteredMeals.reduce((sum, m) => sum + m.total.calories, 0) / totalMeals);
    const avgProtein = Math.round(filteredMeals.reduce((sum, m) => sum + m.total.protein, 0) / totalMeals * 10) / 10;
    const avgCarbs = Math.round(filteredMeals.reduce((sum, m) => sum + m.total.carbs, 0) / totalMeals * 10) / 10;
    const avgFat = Math.round(filteredMeals.reduce((sum, m) => sum + m.total.fat, 0) / totalMeals * 10) / 10;
    const avgFiber = Math.round(filteredMeals.reduce((sum, m) => sum + m.total.fiber, 0) / totalMeals * 10) / 10;
    const avgScore = (filteredMeals.reduce((sum, m) => sum + (m.evaluation?.score || 0), 0) / totalMeals).toFixed(1);

    // Daily aggregation for chart
    const dailyData: Record<string, { date: string; calories: number; meals: number }> = {};
    filteredMeals.forEach(meal => {
      if (!dailyData[meal.date]) {
        dailyData[meal.date] = { date: meal.date.slice(5), calories: 0, meals: 0 };
      }
      dailyData[meal.date].calories += meal.total.calories;
      dailyData[meal.date].meals += 1;
    });

    const chartData = Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));

    // Meal type distribution
    const typeCount: Record<string, number> = {};
    filteredMeals.forEach(meal => {
      typeCount[meal.typeName] = (typeCount[meal.typeName] || 0) + 1;
    });
    const pieData = Object.entries(typeCount).map(([name, value]) => ({ name, value }));

    const COLORS = ['#d4a843', '#db8c5e', '#5ea8a0', '#939e82'];

    return {
      totalMeals,
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFat,
      avgFiber,
      avgScore,
      chartData,
      pieData,
      COLORS,
    };
  }, [filteredMeals]);

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (period === 'week') {
      d.setDate(d.getDate() - 7);
    } else {
      d.setMonth(d.getMonth() - 1);
    }
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (period === 'week') {
      d.setDate(d.getDate() + 7);
    } else {
      d.setMonth(d.getMonth() + 1);
    }
    setCurrentDate(d);
  };

  const handleExport = async () => {
    if (meals.length === 0) return;
    await exportMealsToExcel(meals);
  };

  const periodLabel = period === 'week' ? '周' : '月';
  const dateLabel = period === 'week'
    ? `${getWeekRange(currentDate).start.getMonth() + 1}/${getWeekRange(currentDate).start.getDate()} - ${getWeekRange(currentDate).end.getMonth() + 1}/${getWeekRange(currentDate).end.getDate()}`
    : `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center bg-white rounded-xl border border-sage-200 p-1 shadow-sm">
          <button
            onClick={() => setPeriod('week')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              period === 'week' ? 'bg-sage-500 text-white shadow-sm' : 'text-sage-600 hover:text-sage-800'
            }`}
          >
            周统计
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              period === 'month' ? 'bg-sage-500 text-white shadow-sm' : 'text-sage-600 hover:text-sage-800'
            }`}
          >
            月统计
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="w-9 h-9 rounded-xl bg-white border border-sage-200 text-sage-600 flex items-center justify-center hover:bg-sage-50 transition-all shadow-sm"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="px-4 py-2 bg-white rounded-xl border border-sage-200 text-sm font-medium text-sage-700 shadow-sm min-w-[140px] text-center">
            {dateLabel}
          </span>
          <button
            onClick={handleNext}
            className="w-9 h-9 rounded-xl bg-white border border-sage-200 text-sage-600 flex items-center justify-center hover:bg-sage-50 transition-all shadow-sm"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <button
          onClick={handleExport}
          disabled={meals.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sage-600 text-white text-sm font-medium hover:bg-sage-700 active:bg-sage-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          <Download size={16} />
          导出 Excel
        </button>
      </div>

      {filteredMeals.length === 0 ? (
        <div className="bg-white rounded-3xl border border-sage-100 p-12 text-center shadow-sm">
          <TrendingUp size={48} className="text-sage-300 mx-auto mb-4" />
          <p className="text-sage-500 text-lg font-medium">该{periodLabel}暂无数据</p>
          <p className="text-sage-400 text-sm mt-1">切换其他时间段或添加饮食记录</p>
        </div>
      ) : stats ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard icon={Flame} label="平均热量" value={`${stats.avgCalories}`} unit="kcal" color="text-terra-500" bg="bg-terra-50" />
            <StatCard icon={Dumbbell} label="平均蛋白" value={`${stats.avgProtein}`} unit="g" color="text-ocean-500" bg="bg-ocean-50" />
            <StatCard icon={Wheat} label="平均碳水" value={`${stats.avgCarbs}`} unit="g" color="text-gold-500" bg="bg-gold-50" />
            <StatCard icon={Droplets} label="平均脂肪" value={`${stats.avgFat}`} unit="g" color="text-sage-500" bg="bg-sage-50" />
            <StatCard icon={Leaf} label="平均纤维" value={`${stats.avgFiber}`} unit="g" color="text-emerald-500" bg="bg-emerald-50" />
            <StatCard icon={TrendingUp} label="平均评分" value={stats.avgScore} unit="分" color="text-sage-600" bg="bg-sage-50" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Calories Chart */}
            <div className="bg-white rounded-3xl border border-sage-100 p-6 shadow-sm">
              <h3 className="text-lg font-bold text-sage-800 mb-6">每日热量摄入</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8ebe3" />
                  <XAxis dataKey="date" tick={{ fill: '#939e82', fontSize: 12 }} axisLine={{ stroke: '#d4d9cc' }} />
                  <YAxis tick={{ fill: '#939e82', fontSize: 12 }} axisLine={{ stroke: '#d4d9cc' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e8ebe3',
                      borderRadius: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    }}
                    formatter={(value) => [`${value} kcal`, '热量']}
                  />
                  <Bar dataKey="calories" fill="#768264" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Meal Type Distribution */}
            <div className="bg-white rounded-3xl border border-sage-100 p-6 shadow-sm">
              <h3 className="text-lg font-bold text-sage-800 mb-6">餐次分布</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={stats.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {stats.pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={stats.COLORS[index % stats.COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #e8ebe3',
                      borderRadius: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-4 mt-4">
                {stats.pieData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: stats.COLORS[index % stats.COLORS.length] }}
                    />
                    <span className="text-sm text-sage-600">{entry.name} ({entry.value}餐)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Meal List for this period */}
          <div className="bg-white rounded-3xl border border-sage-100 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-sage-800 mb-4">
              该{periodLabel}共 {stats.totalMeals} 餐记录
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-sage-500 border-b border-sage-100">
                    <th className="text-left py-3 px-3 font-medium">日期</th>
                    <th className="text-left py-3 px-3 font-medium">餐次</th>
                    <th className="text-left py-3 px-3 font-medium">饮食内容</th>
                    <th className="text-right py-3 px-3 font-medium">热量</th>
                    <th className="text-right py-3 px-3 font-medium">蛋白</th>
                    <th className="text-right py-3 px-3 font-medium">碳水</th>
                    <th className="text-right py-3 px-3 font-medium">脂肪</th>
                    <th className="text-center py-3 px-3 font-medium">评分</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMeals.map((meal, idx) => (
                    <tr key={meal.id || idx} className="border-b border-sage-50 last:border-0 hover:bg-cream-50 transition-colors">
                      <td className="py-3 px-3 text-sage-700">{meal.date}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-sage-100 text-sage-600">
                          {meal.typeName}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-sage-700 max-w-[200px] truncate">{meal.content}</td>
                      <td className="py-3 px-3 text-right text-sage-600">{meal.total.calories}</td>
                      <td className="py-3 px-3 text-right text-sage-600">{meal.total.protein}g</td>
                      <td className="py-3 px-3 text-right text-sage-600">{meal.total.carbs}g</td>
                      <td className="py-3 px-3 text-right text-sage-600">{meal.total.fat}g</td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-bold ${
                          (meal.evaluation?.score || 0) >= 8 ? 'bg-emerald-50 text-emerald-700' :
                          (meal.evaluation?.score || 0) >= 6 ? 'bg-amber-50 text-amber-700' :
                          'bg-rose-50 text-rose-700'
                        }`}>
                          {meal.evaluation?.score || 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, unit, color, bg }: {
  icon: typeof Flame;
  label: string;
  value: string;
  unit: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-sage-100 p-4 shadow-sm">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
        <Icon size={20} className={color} />
      </div>
      <div className="text-2xl font-bold text-sage-800">{value}</div>
      <div className="text-xs text-sage-500">{unit}</div>
      <div className="text-xs text-sage-400 mt-1">{label}</div>
    </div>
  );
}
