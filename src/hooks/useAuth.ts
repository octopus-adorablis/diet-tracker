import { useState, useEffect, useCallback } from 'react';
import { supabase, getCurrentUser } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

const DEMO_USER_KEY = 'diet_tracker_demo_user';
const DEMO_USER_ID = 'demo-user-local';

function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  return url !== '' && url !== 'https://placeholder.supabase.co';
}

export interface AuthState {
  user: User | { id: string; email: string; isDemo: true } | null;
  loading: boolean;
  isDemo: boolean;
  signUp: (email: string, password: string) => Promise<{ error?: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error?: Error | null }>;
  signOut: () => Promise<{ error?: Error | null }>;
  setDemoMode: () => void;
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

    getCurrentUser().then(u => {
      setUser(u);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    if (!isSupabaseConfigured()) {
      return { error: new Error('请先配置 Supabase，或点击"体验 Demo"直接进入') };
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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

  return { user, loading, isDemo, signUp, signIn, signOut, setDemoMode };
}
