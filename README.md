# 饮食记录 Diet Tracker

一个支持多用户的饮食记录网站，可以从 AI 对话中快速导入营养分析数据。

## 核心功能

- **多用户系统**：邮箱注册/登录，数据完全隔离
- **日历视图**：直观查看每日饮食记录
- **列表视图**：按时间倒序查看所有餐食
- **AI 快速导入**：复制 AI 返回的 JSON 数据，一键导入完整营养分析
- **简单记录**：快速记录饮食内容（无需详细营养数据）
- **周/月统计**：平均热量、蛋白质、碳水、脂肪、纤维统计
- **数据导出**：支持导出 Excel 文件

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS v4 + Supabase + Recharts

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量（复制 .env.example 为 .env，填入 Supabase 配置）
cp .env.example .env

# 启动开发服务器
npm run dev
```

## 部署

详见 [DEPLOY.md](./DEPLOY.md)

## AI 导入 JSON 格式

```json
{
  "date": "2026-05-22",
  "type": "lunch",
  "typeName": "午餐",
  "time": "12:00",
  "content": "清蒸鱼、蒜蓉菜心、杂粮饭",
  "items": [
    {
      "name": "清蒸鱼（油泼）",
      "weight": 170,
      "calories": 215,
      "carbs": 0,
      "protein": 34,
      "fat": 9,
      "fiber": 0,
      "note": "含葱丝油泼约5g油"
    }
  ],
  "total": {
    "calories": 354,
    "carbs": 24.5,
    "protein": 38.8,
    "fat": 11.9,
    "fiber": 4.7
  },
  "evaluation": {
    "score": 8,
    "scoreLabel": "较均衡",
    "items": [
      {
        "name": "热量",
        "value": "354大卡",
        "target": "450-550",
        "status": "warning",
        "statusText": "偏低约100-200大卡",
        "icon": "🔥"
      }
    ],
    "highlights": [
      "蛋白质优秀（38.8g）：清蒸鱼提供34g优质蛋白，完全达标"
    ],
    "suggestions": [
      "热量偏低：354大卡对于午餐偏少，下午容易饿。建议米饭增加到100g生重"
    ]
  }
}
```

## 免费方案说明

- **Supabase**：免费数据库 + 认证（500MB 存储，无限用户）
- **Netlify**：免费静态托管（100GB/月流量）
- **AI 分析**：用户自行使用任意免费 AI（DeepSeek、Kimi、豆包等），网站零 API 调用

## License

MIT
