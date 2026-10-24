import { useState, useEffect, useCallback } from 'react';
import { supabase, getCurrentUser } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

const DEMO_USER_KEY = 'diet_tracker_demo_user';
const DEMO_USER_ID = 'demo-user-local';

function isSupabaseConfigured(): boolean {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  return key !== '' && key !== 'placeholder';
}

export interface AuthState {
  user: User | { id: string; email: string; isDemo: true } | null;
  loading: boolean;
  isDemo: boolean;
  signUp: (email: string, password: string) => Promise<{ error?: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error?: Error | null }>;
  signOut: () => Promise<{ error?: Error | null }>;
  setDemoMode: () => void;
  resetPassword: (email: string) => Promise<{ error?: Error | null }>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | { id: string; email: string; isDemo: true } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    // Check if already in demo mode
    if (localStorage.getItem(DEMO_USER_KEY) === 'true') {
      setUser({ id: DEMO_USER_ID, email: 'demo@local.app', isDemo: true });
      setIsDemo(true);
      setLoading(false);
      return;
    }

    // Try Supabase auth
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    // 超时兜底：若连不上 Supabase（被墙/项目暂停/网络异常），最多等 8 秒就进入登录页，
    // 避免一直转圈卡死。Supabase 客户端的 promise 会在后台继续，登录页仍可重试。
    const authPromise = getCurrentUser();
    const timeoutPromise = new Promise<User | null>((resolve) =>
      setTimeout(() => {
        console.warn('[useAuth] getCurrentUser 超时（8s），直接进入登录页');
        resolve(null);
      }, 8000)
    );
    Promise.race([authPromise, timeoutPromise])
      .then(u => {
        setUser(u);
        setLoading(false);
      })
      .catch(err => {
        // Supabase 连接失败：不要卡在加载态，回到登录页
        console.error('[useAuth] getCurrentUser failed:', err);
        setUser(null);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (window as any).__diag?.('onAuthStateChange: ' + _event)
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      return { error: new Error('请先配置 Supabase，或点击"体验 Demo"直接进入') };
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    (window as any).__diag?.('signIn called')
    if (!isSupabaseConfigured()) {
      return { error: new Error('请先配置 Supabase，或点击"体验 Demo"直接进入') };
    }
    (window as any).__diag?.('signIn before supabase.auth.signInWithPassword')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    (window as any).__diag?.('signIn returned; error=' + (error?.message || 'none'))
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    if (isDemo) {
      localStorage.removeItem(DEMO_USER_KEY);
      setUser(null);
      setIsDemo(false);
      return { error: null };
    }
    const { error } = await supabase.auth.signOut();
    if (!error) setUser(null);
    return { error };
  }, [isDemo]);

  const setDemoMode = useCallback(() => {
    localStorage.setItem(DEMO_USER_KEY, 'true');
    setUser({ id: DEMO_USER_ID, email: 'demo@local.app', isDemo: true });
    setIsDemo(true);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!isSupabaseConfigured()) {
      return { error: new Error('请先配置 Supabase，或点击"体验 Demo"直接进入') };
    }
    const redirectTo = window.location.origin + '/#update-password';
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return { error };
  }, []);

  return { user, loading, isDemo, signUp, signIn, signOut, setDemoMode, resetPassword };
}
