import { useState } from 'react';
import { Leaf, Mail, Lock, UserPlus, LogIn, Loader2, Globe } from 'lucide-react';

interface AuthFormProps {
  onSignIn: (email: string, password: string) => Promise<{ error?: Error | null }>;
  onSignUp: (email: string, password: string) => Promise<{ error?: Error | null }>;
  onDemo: () => void;
}

export default function AuthForm({ onSignIn, onSignUp, onDemo }: AuthFormProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email || !password) {
      setError('请填写邮箱和密码');
      return;
    }

    if (isSignUp) {
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
      if (password.length < 6) {
        setError('密码长度至少为6位');
        return;
      }
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await onSignUp(email, password);
        if (error) throw error;
        setSuccess('注册成功！请查收验证邮件后登录');
        setIsSignUp(false);
      } else {
        const { error } = await onSignIn(email, password);
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sage-500 text-white mb-4 shadow-lg shadow-sage-500/20">
            <Leaf size={32} />
          </div>
          <h1 className="text-2xl font-bold text-sage-800 mb-1">饮食记录</h1>
          <p className="text-sage-500 text-sm">记录每一餐，关注你的健康</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-3xl shadow-xl shadow-sage-900/5 p-8 border border-sage-100">
          <h2 className="text-xl font-semibold text-sage-800 mb-6 text-center">
            {isSignUp ? '创建账号' : '欢迎回来'}
          </h2>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm border border-emerald-200">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-sage-700 mb-1.5">邮箱</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage-400" size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-sage-200 bg-cream-50 text-sage-800 placeholder-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-sage-700 mb-1.5">密码</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage-400" size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="至少6位密码"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-sage-200 bg-cream-50 text-sage-800 placeholder-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {isSignUp && (
              <div>
                <label className="block text-sm font-medium text-sage-700 mb-1.5">确认密码</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage-400" size={18} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-sage-200 bg-cream-50 text-sage-800 placeholder-sage-400 focus"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-sage-600 text-white font-medium hover:bg-sage-700 active:bg-sage-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : isSignUp ? (
                <><UserPlus size={20} /> 注册</>
              ) : (
                <><LogIn size={20} /> 登录</>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccess('');
              }}
              className="text-sage-600 hover:text-sage-800 text-sm font-medium transition-colors"
            >
              {isSignUp ? '已有账号？直接登录' : '还没有账号？立即注册'}
            </button>
          </div>
        </div>

        {/* Demo Mode Button */}
        <div className="mt-4 text-center">
          <button
            onClick={onDemo}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-ocean-50 text-ocean-700 font-medium hover:bg-ocean-100 transition-colors border border-ocean-200"
          >
            <Globe size={18} />
            免注册，直接体验 Demo
          </button>
          <p className="text-sage-400 text-xs mt-2">
            数据保存在浏览器本地，刷新后仍可查看
          </p>
        </div>

        <p className="text-center text-sage-400 text-xs mt-4">
          数据安全存储于 Supabase，仅你本人可访问
        </p>
      </div>
    </div>
  );
}
