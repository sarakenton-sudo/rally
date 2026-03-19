import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { Session, User } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/database';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  acceptInvite: (code: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  userProfile: null,
  isLoading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signInWithGoogle: async () => ({ error: null }),
  signOut: async () => {},
  resetPassword: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  acceptInvite: async () => ({ error: null }),
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const validatedRef = useRef(false);

  const fetchUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) {
      setUserProfile(data as UserProfile);
    } else {
      setUserProfile(null);
    }
  };

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
            setUserProfile(null);
          } else {
            console.log('[Auth] Valid session for user:', user.email);
            setSession(cached);
            await fetchUserProfile(user.id);

          }
        } else {
          console.log('[Auth] No cached session');
          setSession(null);
          setUserProfile(null);
        }
      } catch (err) {
        console.error('[Auth] Init error, clearing session:', err);
        await supabase.auth.signOut().catch(() => {});
        setSession(null);
        setUserProfile(null);
      }

      validatedRef.current = true;
      setIsLoading(false);
    };

    init();

    // Step 2: Listen for FUTURE auth changes (sign in, sign out, token refresh)
    // But ignore events until initial validation is done
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (validatedRef.current) {
        setSession(newSession);
        if (newSession?.user) {
          fetchUserProfile(newSession.user.id);

        } else {
          setUserProfile(null);
        }
        // Navigate to change-password screen on password recovery
        if (event === 'PASSWORD_RECOVERY') {
          router.replace('/settings/change-password');
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    // Early access gate: check if email has been invited before allowing signup
    try {
      const { data: leadData, error: leadError } = await supabase.rpc('check_lead_status', {
        check_email: email.trim().toLowerCase(),
      });
      if (leadError) {
        console.error('[Auth] check_lead_status error:', leadError.message);
        return { error: 'Unable to verify early access status. Please try again.' };
      }
      if (!leadData || (Array.isArray(leadData) && leadData.length === 0) || leadData?.status !== 'invited') {
        return { error: 'EARLY_ACCESS_REQUIRED' };
      }
    } catch (err: any) {
      console.error('[Auth] Early access check failed:', err);
      return { error: 'Unable to verify early access status. Please try again.' };
    }

    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  };

  const signInWithGoogle = async () => {
    try {
      const redirectUrl = Platform.OS === 'web'
        ? `${window.location.origin}/auth`
        : Linking.createURL('google-callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (error) return { error: error.message };
      if (data.url) {
        if (Platform.OS === 'web') {
          window.location.href = data.url;
        } else {
          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
          if (result.type !== 'success') {
            return { error: 'Google sign-in was cancelled' };
          }
        }
      }
      return { error: null };
    } catch (err: any) {
      return { error: err?.message ?? 'Google sign-in failed' };
    }
  };

  const signOut = async () => {
    setUserProfile(null);
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'rally://reset-callback',
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  };

  const acceptInvite = async (code: string) => {
    const { data, error } = await supabase.rpc('accept_athlete_invite', { code });
    if (error) return { error: error.message };
    const result = data as { success: boolean; error?: string; message?: string };
    if (!result.success) return { error: result.error ?? 'Failed to accept invite' };
    // Refresh profile after accepting invite (role may have changed)
    if (session?.user) {
      await fetchUserProfile(session.user.id);
    }
    return { error: null };
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, userProfile, isLoading, signIn, signUp, signInWithGoogle, signOut, resetPassword, updatePassword, acceptInvite }}>
      {children}
    </AuthContext.Provider>
  );
}
