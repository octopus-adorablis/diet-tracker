import { useState } from 'react';
import { X, ClipboardPaste, FileText, Sparkles, Loader2, Check } from 'lucide-react';
import type { MealData, AIMealImport } from '../types';
import { generateAIPrompt } from '../lib/export';

interface AddMealModalProps {
  userId: string;
  onClose: () => void;
  onAdd: (meal: MealData) => Promise<void>;
}

type TabType = 'simple' | 'ai-import';

export default function AddMealModal({ userId, onClose, onAdd }: AddMealModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('simple');

  // Simple form state
  const [simpleDate, setSimpleDate] = useState(new Date().toISOString().split('T')[0]);
  const [simpleType, setSimpleType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');
  const [simpleTime, setSimpleTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [simpleContent, setSimpleContent] = useState('');
  const [simpleSubmitting, setSimpleSubmitting] = useState(false);

  // AI import state
  const [aiJson, setAiJson] = useState('');
  const [aiSubmitting, setAiSubmitting] = useState(false);
  const [aiError, setAiError] = useState('');
  const [copied, setCopied] = useState(false);

  const typeOptions = [
    { value: 'breakfast' as const, label: '早餐' },
    { value: 'lunch' as const, label: '午餐' },
    { value: 'dinner' as const, label: '晚餐' },
    { value: 'snack' as const, label: '加餐' },
  ];

  const handleSimpleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simpleContent.trim()) return;

    setSimpleSubmitting(true);

    const meal: MealData = {
      user_id: userId,
      date: simpleDate,
      type: simpleType,
      typeName: typeOptions.find(t => t.value === simpleType)?.label || '午餐',
      time: simpleTime,
      content: simpleContent.trim(),
      items: [],
      total: { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 },
      evaluation: {
        score: 0,
        scoreLabel: '待分析',
        items: [],
        highlights: [],
        suggestions: [],
      },
    };

    try {
      await onAdd(meal);
      setSimpleSubmitting(false);
      onClose();
    } catch (err: any) {
      console.error('Simple submit error:', err);
      alert('保存失败：' + (err.message || '未知错误'));
      setSimpleSubmitting(false);
    }
  };

  const handleAIImport = async () => {
    setAiError('');
    if (!aiJson.trim()) {
      setAiError('请粘贴 AI 返回的 JSON 数据');
      return;
    }

    setAiSubmitting(true);

    try {
      // Try to extract JSON from the text (in case AI wrapped it in markdown)
      let jsonStr = aiJson.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const data: AIMealImport = JSON.parse(jsonStr);

      // Validate required fields
      if (!data.content || !data.items || !data.total || !data.evaluation) {
        throw new Error('JSON 格式不完整，缺少必要字段');
      }

      const meal: MealData = {
        user_id: userId,
        date: data.date || new Date().toISOString().split('T')[0],
        type: data.type || 'lunch',
        typeName: data.typeName || '午餐',
        time: data.time || '12:00',
        content: data.content,
        items: data.items,
        total: data.total,
        evaluation: data.evaluation,
      };

      await onAdd(meal);
      setAiSubmitting(false);
      onClose();
    } catch (err: any) {
      console.error('AI Import error:', err);
      setAiError('导入失败：' + (err.message || 'JSON 格式错误，请检查复制的内容'));
      setAiSubmitting(false);
    }
  };

  const handleCopyPrompt = async () => {
    const prompt = generateAIPrompt();
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sage-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-cream-100 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-cream-100/90 backdrop-blur-md px-6 py-4 border-b border-sage-100 flex items-center justify-between z-10">
          <h3 className="text-xl font-bold text-sage-800">添加饮食记录</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white border border-sage-200 text-sage-500 flex items-center justify-center hover:bg-sage-50 hover:text-sage-700 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4">
          <div className="flex items-center bg-white rounded-xl border border-sage-200 p-1">
            <button
              onClick={() => setActiveTab('simple')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'simple' ? 'bg-sage-500 text-white shadow-sm' : 'text-sage-600 hover:text-sage-800'
              }`}
            >
              <FileText size={16} />
              简单记录
            </button>
            <button
              onClick={() => setActiveTab('ai-import')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'ai-import' ? 'bg-sage-500 text-white shadow-sm' : 'text-sage-600 hover:text-sage-800'
              }`}
            >
              <Sparkles size={16} />
              AI 导入
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'simple' ? (
            <form onSubmit={handleSimpleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-sage-700 mb-1.5">日期</label>
                  <input
                    type="date"
                    value={simpleDate}
                    onChange={e => setSimpleDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-sage-200 bg-white text-sage-800 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-sage-700 mb-1.5">时间</label>
                  <input
                    type="time"
                    value={simpleTime}
                    onChange={e => setSimpleTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-sage-200 bg-white text-sage-800 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-sage-700 mb-1.5">餐次</label>
                <div className="grid grid-cols-4 gap-2">
                  {typeOptions.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSimpleType(opt.value)}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                        simpleType === opt.value
                          ? 'bg-sage-500 text-white shadow-sm'
                          : 'bg-white border border-sage-200 text-sage-600 hover:border-sage-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-sage-700 mb-1.5">饮食内容</label>
                <textarea
                  value={simpleContent}
                  onChange={e => setSimpleContent(e.target.value)}
                  placeholder="例如：清蒸鱼170g、蒜蓉菜心170g、杂粮饭75g..."
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-sage-200 bg-white text-sage-800 placeholder-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-transparent transition-all resize-none"
                />
                <p className="text-xs text-sage-400 mt-1.5">
                  简单描述即可，详细营养分析请使用 AI 导入功能
                </p>
              </div>

              <button
                type="submit"
                disabled={simpleSubmitting || !simpleContent.trim()}
                className="w-full py-3 rounded-xl bg-sage-600 text-white font-medium hover:bg-sage-700 active:bg-sage-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {simpleSubmitting ? (
                  <><Loader2 size={18} className="animate-spin" /> 保存中...</>
                ) : (
                  '保存记录'
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {/* AI Prompt */}
              <div className="bg-sage-50 rounded-xl p-4 border border-sage-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-sage-700">给 AI 的指令模板</h4>
                  <button
                    onClick={handleCopyPrompt}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      copied
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-white text-sage-600 hover:bg-sage-100 border border-sage-200'
                    }`}
                  >
                    {copied ? <><Check size={14} /> 已复制</> : <><ClipboardPaste size={14} /> 复制指令</>}
                  </button>
                </div>
                <p className="text-xs text-sage-500 leading-relaxed">
                  1. 复制上方指令，粘贴给任意 AI（DeepSeek、Kimi、豆包等）<br/>
                  2. 告诉 AI 你吃了什么，让 AI 分析营养<br/>
                  3. 要求 AI 返回 JSON 格式数据<br/>
                  4. 复制 AI 返回的 JSON，粘贴到下方输入框
                </p>
              </div>

              {/* JSON Input */}
              <div>
                <label className="block text-sm font-medium text-sage-700 mb-1.5">
                  粘贴 AI 返回的 JSON
                </label>
                <textarea
                  value={aiJson}
                  onChange={e => setAiJson(e.target.value)}
                  placeholder={`{\n  "date": "2026-05-22",\n  "type": "lunch",\n  "content": "清蒸鱼、菜心、米饭",\n  "items": [...],\n  "total": {...},\n  "evaluation": {...}\n}`}
                  rows={10}
                  className="w-full px-4 py-3 rounded-xl border border-sage-200 bg-white text-sage-800 placeholder-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-transparent transition-all resize-none font-mono text-xs"
                />
                {aiError && (
                  <p className="text-xs text-rose-600 mt-1.5">{aiError}</p>
                )}
              </div>

              <button
                onClick={handleAIImport}
                disabled={aiSubmitting || !aiJson.trim()}
                className="w-full py-3 rounded-xl bg-terra-500 text-white font-medium hover:bg-terra-600 active:bg-terra-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {aiSubmitting ? (
                  <><Loader2 size={18} className="animate-spin" /> 解析中...</>
                ) : (
                  <><Sparkles size={18} /> 导入数据</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
