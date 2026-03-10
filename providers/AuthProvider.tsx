import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  isLoading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  resetPassword: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const validatedRef = useRef(false);

  useEffect(() => {
    // Step 1: Validate cached session server-side before trusting it
    const init = async () => {
      try {
        const { data: { session: cached } } = await supabase.auth.getSession();

        if (cached) {
          // Verify the user actually still exists on the server
          const { data: { user }, error } = await supabase.auth.getUser();
          console.log('[Auth] getUser result:', { hasUser: !!user, error: error?.message });
          if (error || !user) {
            // Stale session — user was deleted. Force clear everything.
            console.log('[Auth] Stale session detected, signing out');
            await supabase.auth.signOut();
            setSession(null);
          } else {
            console.log('[Auth] Valid session for user:', user.email);
            setSession(cached);
          }
        } else {
          console.log('[Auth] No cached session');
          setSession(null);
        }
      } catch (err) {
        console.error('[Auth] Init error, clearing session:', err);
        await supabase.auth.signOut().catch(() => {});
        setSession(null);
      }

      validatedRef.current = true;
      setIsLoading(false);
    };

    init();

    // Step 2: Listen for FUTURE auth changes (sign in, sign out, token refresh)
    // But ignore events until initial validation is done
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (validatedRef.current) {
        setSession(newSession);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message ?? null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, isLoading, signIn, signUp, signOut, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}
