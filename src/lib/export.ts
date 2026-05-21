import type { MealData } from '../types';

export async function exportMealsToExcel(meals: MealData[]) {
  const XLSX = (await import('xlsx')).default;

  // Sort meals by date descending
  const sortedMeals = [...meals].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.time.localeCompare(b.time);
  });

  const rows = sortedMeals.flatMap(meal =>
    meal.items.map((item, idx) => ({
      '日期': meal.date,
      '餐次': meal.typeName,
      '时间': meal.time,
      '饮食内容': idx === 0 ? meal.content : '',
      '食材': item.name,
      '重量(g)': item.weight,
      '热量(kcal)': item.calories,
      '碳水(g)': item.carbs,
      '蛋白质(g)': item.protein,
      '脂肪(g)': item.fat,
      '纤维(g)': item.fiber,
      '备注': item.note || '',
      '总热量': idx === 0 ? meal.total.calories : '',
      '总碳水': idx === 0 ? meal.total.carbs : '',
      '总蛋白质': idx === 0 ? meal.total.protein : '',
      '总脂肪': idx === 0 ? meal.total.fat : '',
      '总纤维': idx === 0 ? meal.total.fiber : '',
      '评分': idx === 0 ? meal.evaluation.score : '',
    }))
  );

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '饮食记录');

  // Auto-adjust column widths
  const colWidths = [
    { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 30 },
    { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 16 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 8 },
  ];
  ws['!cols'] = colWidths;

  const now = new Date();
  const filename = `饮食记录_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function generateAIPrompt(): string {
  return `请分析我这一餐的饮食，并输出以下 JSON 格式的数据。JSON 必须严格符合这个格式：

{
  "date": "YYYY-MM-DD",
  "type": "lunch",
  "typeName": "午餐",
  "time": "12:00",
  "content": "用户描述的饮食内容，如：清蒸鱼、蒜蓉菜心、杂粮饭",
  "items": [
    {
      "name": "食材名称",
      "weight": 170,
      "calories": 215,
      "carbs": 0,
      "protein": 34,
      "fat": 9,
      "fiber": 0,
      "note": "备注说明"
    }
  ],
  "total": {
    "calories": 560,
    "carbs": 59.6,
    "protein": 50,
    "fat": 12.8,
    "fiber": 10.5
  },
  "evaluation": {
    "score": 8,
    "scoreLabel": "较均衡",
    "items": [
      {
        "name": "热量",
        "value": "560大卡",
        "target": "450-550",
        "status": "good",
        "statusText": "略超一点，可接受",
        "icon": "🔥"
      }
    ],
    "highlights": [
      "蛋白质充足（50g）：金枪鱼+鸡蛋，完全达标"
    ],
    "suggestions": [
      "碳水超标：红薯+土豆叠加后碳水达45g，建议去掉其中一个"
    ]
  }
}

type 可选值：breakfast（早餐）、lunch（午餐）、dinner（晚餐）、snack（加餐）
status 可选值：good（达标/优秀）、warning（偏高/偏低/需注意）、danger（超标严重/不足）

请根据我的饮食描述，给出精确的营养分析和建议。`;
}
