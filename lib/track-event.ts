import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// Every event says where it happened (iPhone app vs website) and which app version.
const PLATFORM = Platform.OS === 'web' ? 'web' : Platform.OS; // 'ios' | 'android' | 'web'
const APP_VERSION = Constants.expoConfig?.version ?? null;
const BUILD = (Constants.expoConfig?.ios as any)?.buildNumber ?? null;

/**
 * Fire-and-forget analytics event to feature_events (admin → Activity).
 * Never throws — silently drops if Supabase is unconfigured or the insert fails.
 */
export function trackEvent(
  userId: string,
  eventType: string,
  metadata: Record<string, unknown> = {}
) {
  if (!isSupabaseConfigured || !userId) return;
  supabase
    .from('feature_events')
    .insert({ user_id: userId, event_type: eventType, metadata: { platform: PLATFORM, app_version: APP_VERSION, build: BUILD, ...metadata } })
    .then(() => {}, () => {});
}

/** Same, for the signed-in user (data helpers that don't have the user id). */
export function track(eventType: string, metadata: Record<string, unknown> = {}) {
  if (!isSupabaseConfigured) return;
  supabase.auth.getSession()
    .then(({ data }) => { const id = data.session?.user.id; if (id) trackEvent(id, eventType, metadata); })
    .catch(() => {});
}
