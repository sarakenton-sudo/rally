import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Email marketing consent (00081). The exact wording is stored with each
// consent event as proof of what the person agreed to — change the version
// suffix when the text changes.
export const MARKETING_CONSENT_TEXT =
  'Email me RallyHUB tips, new features and offers. Unsubscribe anytime. (v1)';
export const MARKETING_CONSENT_LABEL = 'Email me RallyHUB tips, new features and offers. Unsubscribe anytime.';

type Source = 'signup_email' | 'signup_google' | 'settings';
const KEY = 'rally.pendingMarketing';
let memory: { optIn: boolean; source: Source; at: number } | null = null;

/** Remember the sign-up checkbox until the new account's profile exists (Google reloads the page on web). */
export function savePendingMarketing(optIn: boolean, source: Source) {
  memory = { optIn, source, at: Date.now() };
  if (Platform.OS === 'web') { try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch {} }
}

function takePending() {
  let v = memory;
  if (Platform.OS === 'web') {
    try { const raw = localStorage.getItem(KEY); if (raw) v = JSON.parse(raw); localStorage.removeItem(KEY); } catch {}
  }
  memory = null;
  if (!v || Date.now() - v.at > 30 * 60 * 1000) return null;
  return v;
}

/** Record the sign-up choice once (never overwrites a later Settings choice). */
export async function applyPendingMarketing() {
  const p = takePending();
  if (!p) return;
  await (supabase.rpc as any)('set_marketing_consent', {
    p_opt_in: p.optIn, p_source: p.source, p_consent_text: MARKETING_CONSENT_TEXT, p_platform: Platform.OS, p_only_if_unset: true,
  });
}

export async function setMarketingEmail(optIn: boolean): Promise<{ value: boolean | null; error: Error | null }> {
  const { data, error } = await (supabase.rpc as any)('set_marketing_consent', {
    p_opt_in: optIn, p_source: 'settings', p_consent_text: MARKETING_CONSENT_TEXT, p_platform: Platform.OS, p_only_if_unset: false,
  });
  return { value: (data as boolean | null) ?? null, error: error ?? null };
}

export async function getMarketingEmail(userId: string): Promise<boolean | null> {
  const { data } = await (supabase.from('user_profiles') as any).select('marketing_email_opt_in').eq('id', userId).maybeSingle();
  return (data?.marketing_email_opt_in as boolean | null) ?? null;
}
