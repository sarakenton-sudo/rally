import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// SecureStore adapter for native, localStorage fallback for web
const storage = Platform.OS === 'web'
  ? {
      getItem: (key: string) => {
        try { return localStorage.getItem(key); } catch { return null; }
      },
      setItem: (key: string, value: string) => {
        try { localStorage.setItem(key, value); } catch {}
      },
      removeItem: (key: string) => {
        try { localStorage.removeItem(key); } catch {}
      },
    }
  : {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    };

/** Deep proxy stub that handles chained access like supabase.auth.getSession() */
function createSupabaseStub(): SupabaseClient<Database> {
  const noop = { data: { session: null }, error: null };
  const noopSub = { data: { subscription: { unsubscribe: () => {} } } };

  const handler: ProxyHandler<any> = {
    get: (_target, prop) => {
      // auth.onAuthStateChange needs to return a subscription
      if (prop === 'onAuthStateChange') return () => noopSub;
      // auth.getSession, auth.signIn, etc. return promises
      if (prop === 'getSession' || prop === 'signInWithPassword' || prop === 'signUp' || prop === 'signOut')
        return () => Promise.resolve(noop);
      // .from().select().order() etc. — return chainable proxy
      if (typeof prop === 'string') return new Proxy(() => new Proxy({}, handler), handler);
      return undefined;
    },
    apply: () => new Proxy({}, handler),
  };

  return new Proxy({}, handler) as SupabaseClient<Database>;
}

// Only create the client if configured — prevents crash in dev without .env
export const supabase: SupabaseClient<Database> = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: storage as any,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : createSupabaseStub();

// Handle deep links with auth tokens (password reset, email confirm, etc.)
if (isSupabaseConfigured && Platform.OS !== 'web') {
  const handleDeepLink = (url: string) => {
    // Supabase redirects with fragment: #access_token=...&type=recovery
    const fragment = url.split('#')[1];
    if (!fragment) return;
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    }
  };

  // Handle URL that launched the app
  Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });
  // Handle URLs while app is running
  Linking.addEventListener('url', (event) => handleDeepLink(event.url));
}
