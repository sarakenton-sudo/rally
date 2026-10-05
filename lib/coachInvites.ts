import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { SITE_URL } from '@/lib/config';

// Parent → coach invites (growth loop). See migration 00078.

export interface CoachInvite {
  id: string; code: string; athlete_id: string | null; coach_label: string | null;
  status: 'sent' | 'joined'; coach_name: string | null; created_at: string; last_sent_at: string;
}

export const coachInviteUrl = (code?: string | null) => `${SITE_URL}/coaches${code ? `?i=${code}` : ''}`;

export function coachInviteMessage(athleteFirst: string, code?: string | null) {
  return `Hey Coach! We use RallyHUB to manage ${athleteFirst}'s season. You can take lesson bookings and payments there, and we'd book with you through it. Set up your free coach page here: ${coachInviteUrl(code)}`;
}

/** New invite code for the signed-in parent (null if offline / not migrated yet). */
export async function createCoachInvite(athleteId?: string | null, coachLabel?: string): Promise<string | null> {
  const { data, error } = await (supabase.rpc as any)('create_coach_invite', {
    p_athlete_id: athleteId ?? null, p_coach_label: coachLabel ?? null,
  });
  return error ? null : (data as string);
}

export async function fetchMyCoachInvites(): Promise<CoachInvite[]> {
  const { data } = await (supabase.rpc as any)('my_coach_invites');
  return (data as CoachInvite[] | null) ?? [];
}

export async function markCoachInviteResent(id: string) {
  await (supabase.from('coach_invites') as any).update({ last_sent_at: new Date().toISOString() }).eq('id', id);
}

// The coach arrives at /auth?…&i=CODE from the coach page. Remember the code
// through sign-up (web reloads on Google sign-in) and claim it once the coach
// profile exists.
const KEY = 'rally.coachInvite';
let memory: string | null = null;

export function rememberCoachInvite(code: string) {
  const c = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!c) return;
  memory = c;
  if (Platform.OS === 'web') { try { localStorage.setItem(KEY, c); } catch {} }
}

function pendingCoachInvite(): string | null {
  if (Platform.OS === 'web') { try { return localStorage.getItem(KEY) ?? memory; } catch {} }
  return memory;
}

function clearCoachInvite() {
  memory = null;
  if (Platform.OS === 'web') { try { localStorage.removeItem(KEY); } catch {} }
}

/**
 * Claim a remembered invite for the signed-in coach. Returns the inviting
 * family's athlete first name ('' if unknown) on success, null if nothing to claim.
 */
export async function claimPendingCoachInvite(): Promise<string | null> {
  const code = pendingCoachInvite();
  if (!code) return null;
  const { data, error } = await (supabase.rpc as any)('claim_coach_invite', { p_code: code });
  if (error) {
    // Keep it for later only if the coach profile isn't set up yet.
    if (!/coach profile required/i.test(error.message)) clearCoachInvite();
    return null;
  }
  clearCoachInvite();
  // Tell the parent who invited this coach (push + email; in-app is a DB trigger).
  supabase.functions.invoke('notify-coach-joined', { body: { code } }).catch(() => {});
  return (data as string) ?? '';
}
