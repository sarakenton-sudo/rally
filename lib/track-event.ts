import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Fire-and-forget analytics event to feature_events table.
 * Never throws — silently drops if Supabase is unconfigured or insert fails.
 */
export function trackEvent(
  userId: string,
  eventType: string,
  metadata: Record<string, unknown> = {}
) {
  if (!isSupabaseConfigured) return;
  supabase
    .from('feature_events')
    .insert({ user_id: userId, event_type: eventType, metadata })
    .then(() => {});
}
