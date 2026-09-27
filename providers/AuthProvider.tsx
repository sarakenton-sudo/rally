import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { Session, User } from '@supabase/supabase-js';
import type { UserProfile, AccountType } from '@/types/database';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, accountType?: AccountType) => Promise<{ error: string | null }>;
  signInWithGoogle: (accountType?: AccountType) => Promise<{ error: string | null }>;
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

// Google OAuth can't carry the Coach/Parent choice (no user metadata), and on web
// the page reloads mid-flow. Remember the choice here and apply it after sign-in.
const PENDING_TYPE_KEY = 'rally.pendingAccountType';
let pendingTypeMemory: { type: AccountType; at: number } | null = null;

function savePendingAccountType(type: AccountType) {
  const v = { type, at: Date.now() };
  pendingTypeMemory = v;
  if (Platform.OS === 'web') { try { localStorage.setItem(PENDING_TYPE_KEY, JSON.stringify(v)); } catch {} }
}

function takePendingAccountType(): AccountType | null {
  let v = pendingTypeMemory;
  if (Platform.OS === 'web') {
    try { const raw = localStorage.getItem(PENDING_TYPE_KEY); if (raw) v = JSON.parse(raw); } catch {}
  }
  if (!v || Date.now() - v.at > 30 * 60 * 1000) return null; // 30 min to finish Google sign-in
  return v.type;
}

function clearPendingAccountType() {
  pendingTypeMemory = null;
  if (Platform.OS === 'web') { try { localStorage.removeItem(PENDING_TYPE_KEY); } catch {} }
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
    if (error || !data) {
      setUserProfile(null);
      return;
    }
    let profile = data as UserProfile;
    // Coach chosen before a Google sign-up → claim the coach account now.
    if (takePendingAccountType() === 'coach' && profile.account_type !== 'coach') {
      const { data: claimed } = await (supabase.rpc as any)('claim_coach_account');
      if (claimed) profile = { ...profile, account_type: 'coach' };
    }
    clearPendingAccountType();
    setUserProfile(profile);
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

  const signUp = async (email: string, password: string, accountType: AccountType = 'parent') => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { account_type: accountType } },
    });
    return { error: error?.message ?? null };
  };

  const signInWithGoogle = async (accountType?: AccountType) => {
    if (accountType === 'coach') savePendingAccountType('coach');
    else clearPendingAccountType();
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
          // The auth session hands the callback URL back here (no Linking event),
          // so finish sign-in from it: PKCE ?code=… or implicit #access_token=….
          const cb = new URL(result.url);
          const hash = new URLSearchParams(cb.hash.replace(/^#/, ''));
          const code = cb.searchParams.get('code');
          const errDesc = cb.searchParams.get('error_description') ?? hash.get('error_description');
          if (errDesc) return { error: errDesc };
          if (code) {
            const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
            if (exErr) return { error: exErr.message };
          } else if (hash.get('access_token') && hash.get('refresh_token')) {
            const { error: setErr } = await supabase.auth.setSession({
              access_token: hash.get('access_token')!,
              refresh_token: hash.get('refresh_token')!,
            });
            if (setErr) return { error: setErr.message };
          } else {
            return { error: 'Google sign-in did not return to the app. Please try again.' };
          }
        }
      }
      return { error: null };
    } catch (err: any) {
      return { error: err?.message ?? 'Google sign-in failed' };
    }
  };

  const signOut = async () => {
    // Close modals BEFORE clearing the session. Sign Out lives in the Account
    // sheet; if the session clears first, the layout's redirect to /auth runs
    // while the sheet is still open and login renders as a card over the app.
    try { if (router.canDismiss()) router.dismissAll(); } catch { /* nothing open */ }
    setUserProfile(null);
    // 'local' clears this device's session without a network round-trip.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.warn('[Auth] signOut error (clearing session anyway):', err);
    }
    setSession(null);
    router.replace('/auth');
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
