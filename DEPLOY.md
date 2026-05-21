# 饮食记录网站 - 部署指南

## 技术栈

- **前端**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **后端/数据库**: Supabase (PostgreSQL + Auth + RLS)
- **图表**: Recharts
- **导出**: SheetJS (xlsx)
- **部署**: Netlify

---

## 1. Supabase 配置

### 1.1 创建项目
1. 访问 https://supabase.com 并登录
2. 点击 "New Project"
3. 填写项目名称（如 diet-tracker）
4. 设置数据库密码（请妥善保存）
5. 选择地区（建议选择离你最近的）
6. 等待项目创建完成

### 1.2 执行数据库脚本
1. 进入项目后，点击左侧菜单 "SQL Editor"
2. 点击 "New query"
3. 将 `supabase-schema.sql` 文件的内容粘贴进去
4. 点击 "Run" 执行

### 1.3 获取 API 密钥
1. 点击左侧菜单 "Project Settings"（齿轮图标）
2. 选择 "API" 标签页
3. 复制以下两项：
   - **Project URL** (如 `https://xxxxx.supabase.co`)
   - **anon public** API key (以 `eyJ...` 开头)

---

## 2. 本地开发配置

### 2.1 创建环境变量文件
```bash
cp .env.example .env
```

### 2.2 编辑 .env 文件
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 2.3 安装依赖并启动
```bash
npm install
npm run dev
```

---

## 3. 部署到 Netlify

### 3.1 方式一：通过 Git 部署（推荐）

1. 在 GitHub 上创建新仓库
2. 将代码推送到 GitHub：
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/diet-tracker.git
   git push -u origin main
   ```

3. 登录 https://netlify.com
4. 点击 "Add new site" > "Import an existing project"
5. 选择 GitHub 并授权
6. 选择你的 diet-tracker 仓库
7. 配置构建设置：
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
8. 点击 "Show advanced" > "New variable"
9. 添加环境变量：
   - `VITE_SUPABASE_URL` = 你的 Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = 你的 Supabase Anon Key
10. 点击 "Deploy site"

### 3.2 方式二：手动上传

1. 本地构建：
   ```bash
   npm run build
   ```

2. 登录 https://netlify.com
3. 点击 "Add new site" > "Deploy manually"
4. 将 `dist` 文件夹拖拽上传
5. 进入 Site settings > Environment variables
6. 添加 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`
7. 重新部署

---

## 4. 配置 Supabase Auth（重要）

### 4.1 允许邮箱注册
1. 在 Supabase 左侧菜单点击 "Authentication"
2. 选择 "Providers" 标签页
3. 确保 "Email" 已启用
4. 可选：关闭 "Confirm email" 如果你不想验证邮箱

### 4.2 配置站点 URL（用于邮件验证）
1. 在 Authentication > URL Configuration
2. 设置 Site URL 为你的 Netlify 域名（如 `https://your-site.netlify.app`）

---

## 5. 使用流程

### 5.1 用户注册/登录
- 访问网站，使用邮箱注册账号
- 登录后即可使用

### 5.2 添加饮食记录
- **方式一（简单记录）**: 点击 + 按钮，选择"简单记录"，填写日期、时间、餐次和饮食描述
- **方式二（AI 导入）**:
  1. 点击 + 按钮，选择"AI 导入"
  2. 点击"复制指令"，粘贴给任意 AI（DeepSeek、Kimi、豆包等）
  3. 告诉 AI 你吃了什么
  4. 要求 AI 返回 JSON 格式
  5. 复制 AI 返回的 JSON，粘贴到输入框
  6. 点击"导入数据"

### 5.3 查看统计
- 切换到"统计"标签页
- 选择"周统计"或"月统计"
- 可导出 Excel 文件

---

## 6. 免费额度说明

| 服务 | 免费额度 | 说明 |
|------|---------|------|
| Supabase Database | 500MB | 足够存储数万条记录 |
| Supabase Auth | 无限用户 | 邮箱验证免费 |
| Netlify Hosting | 100GB/月 | 静态网站托管 |
| Netlify Bandwidth | 100GB/月 | 足够个人使用 |

---

## 7. 项目结构

```
diet-tracker/
├── src/
│   ├── components/       # React 组件
│   │   ├── AuthForm.tsx      # 登录/注册表单
│   │   ├── Header.tsx        # 顶部导航
│   │   ├── CalendarView.tsx  # 日历视图
│   │   ├── ListView.tsx      # 列表视图
│   │   ├── StatsView.tsx     # 统计视图
│   │   ├── MealCard.tsx      # 餐食卡片
│   │   ├── MealDetailModal.tsx  # 日期详情弹窗
│   │   └── AddMealModal.tsx     # 添加记录弹窗
│   ├── hooks/            # 自定义 Hooks
│   │   ├── useAuth.ts        # 认证逻辑
│   │   └── useMeals.ts       # 餐食数据逻辑
│   ├── lib/              # 工具函数
│   │   ├── supabase.ts       # Supabase 客户端
│   │   ├── utils.ts          # 通用工具
│   │   └── export.ts         # Excel 导出
│   ├── types.ts          # TypeScript 类型
│   ├── App.tsx           # 主应用
│   ├── main.tsx          # 入口文件
│   └── index.css         # 全局样式
├── supabase-schema.sql   # 数据库 Schema
├── netlify.toml          # Netlify 配置
├── .env.example          # 环境变量示例
└── package.json
```

---

## 8. 常见问题

### Q: 用户注册后收不到验证邮件？
A: 在 Supabase Authentication > Providers > Email 中关闭 "Confirm email" 选项。

### Q: 如何修改配色风格？
A: 编辑 `src/index.css` 中的 `@theme` 部分，修改 `--color-*` 变量。

### Q: 如何添加更多营养指标？
A: 修改 `src/types.ts` 中的 `NutritionItem` 和 `MealData` 类型，然后更新相关组件。

### Q: 数据安全吗？
A: 使用了 Supabase RLS（行级安全），每个用户只能访问自己的数据。数据库密码和 API 密钥请妥善保管。
