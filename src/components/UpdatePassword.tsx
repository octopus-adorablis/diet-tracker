import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Leaf, Lock, Loader2, CheckCircle2 } from 'lucide-react';

// 从 URL 解析 token_hash：兼容 query (?token_hash=...) 与 hash 内 (#update-password?token_hash=...) 两种位置
function getTokenHash(): string | null {
  const search = new URLSearchParams(window.location.search);
  if (search.get('token_hash')) return search.get('token_hash');
  const hash = window.location.hash;
  const qIndex = hash.indexOf('?');
  if (qIndex >= 0) {
    const h = new URLSearchParams(hash.slice(qIndex + 1));
    if (h.get('token_hash')) return h.get('token_hash');
  }
  return null;
}

export default function UpdatePassword({ onComplete }: { onComplete: () => void }) {
  const [verifying, setVerifying] = useState(true);
  const [verifyErr, setVerifyErr] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const token = getTokenHash();
    if (!token) {
      setVerifying(false);
      setVerifyErr('重置链接无效或已过期，请重新发起密码重置');
      return;
    }
    supabase.auth
      .verifyOtp({ token_hash: token, type: 'recovery' })
      .then(({ error }) => {
        setVerifying(false);
        if (error) setVerifyErr(error.message || '验证失败，请重新发起密码重置');
      })
      .catch((e: any) => {
        setVerifying(false);
        setVerifyErr(e?.message || '验证失败');
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      // 更新成功后退出 recovery 临时会话，回到登录页用新密码登录
      setTimeout(async () => {
        await supabase.auth.signOut().catch(() => {});
        onComplete();
      }, 1200);
    } catch (err: any) {
      setError(err.message || '更新失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sage-500 text-white mb-4 shadow-lg shadow-sage-500/20">
            <Leaf size={32} />
          </div>
          <h1 className="text-2xl font-bold text-sage-800 mb-1">设置新密码</h1>
          <p className="text-sage-500 text-sm">为你的饮食记录账号设置新密码</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-sage-900/5 p-8 border border-sage-100">
          {verifying ? (
            <div className="flex items-center justify-center py-8 text-sage-500">
              <Loader2 size={24} className="animate-spin mr-2" /> 正在验证重置链接…
            </div>
          ) : verifyErr ? (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200">
              {verifyErr}
            </div>
          ) : success ? (
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 size={18} /> 密码已更新成功，正在返回登录页…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm border border-rose-200">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-sage-700 mb-1.5">新密码</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage-400" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="至少 6 位密码"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-sage-200 bg-cream-50 text-sage-800 placeholder-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-transparent transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-sage-700 mb-1.5">确认新密码</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage-400" size={18} />
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="再次输入"
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-sage-200 bg-cream-50 text-sage-800 placeholder-sage-400 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-transparent transition-all"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-sage-600 text-white font-medium hover:bg-sage-700 active:bg-sage-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : '更新密码'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sage-400 text-xs mt-4">
          数据安全存储于 Supabase，仅你本人可访问
        </p>
      </div>
    </div>
  );
}
