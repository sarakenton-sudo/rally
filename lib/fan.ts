import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { SITE_URL } from '@/lib/config';

// Fan accounts (00086): guests invited into the app, read-only.

export const APP_STORE_URL = 'https://apps.apple.com/app/id6762097230';
export const fanInviteUrl = (code: string) => `${SITE_URL}/fan/${code}`;

export function fanInviteMessage(guestFirst: string, athleteFirst: string, code: string) {
  const hi = guestFirst ? `Hi ${guestFirst}! ` : '';
  return `${hi}Follow ${athleteFirst}'s volleyball season on RallyHUB — tournament dates, locations, live streams and tickets, with alerts on game day. It's free: ${fanInviteUrl(code)}`;
}

/** Normalizes a pasted code or link (…/fan/ABCD2345) to the bare code. */
export function parseFanCode(input: string): string {
  const m = input.match(/\/fan\/([A-Za-z0-9-]+)/);
  return (m ? m[1] : input).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export interface FanTournament {
  tournament_id: string; name: string; start_date: string; end_date: string; location_city: string;
  venues: { address: string; label: string; is_confirmed: boolean }[] | null;
  streaming_links: { label: string; url: string }[] | null;
  ticket_link: string | null; schedule_link: string | null; default_stream_url: string | null;
  team_name: string; athlete_id: string; athlete_first_name: string;
}

/** Group a fan's tournaments by month label ("November 2026"), in date order. */
export function groupByMonth<T extends { start_date: string }>(rows: T[]): { month: string; items: T[] }[] {
  const out: { month: string; items: T[] }[] = [];
  for (const r of [...rows].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    const [y, m] = r.start_date.split('-').map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const last = out[out.length - 1];
    if (last && last.month === label) last.items.push(r); else out.push({ month: label, items: [r] });
  }
  return out;
}

export async function createFanInvite(guestId: string): Promise<{ code: string | null; error: Error | null }> {
  const { data, error } = await (supabase.rpc as any)('create_fan_invite', { p_guest_id: guestId });
  return { code: (data as string | null) ?? null, error: error ?? null };
}

/** Email the guest their invite (only when they have an email). Fire-and-forget. */
export function emailFanInvite(guestId: string) {
  supabase.functions.invoke('send-fan-invite', { body: { guest_id: guestId } })
    .then(({ error }) => { if (error) console.warn('[fan] invite email failed:', error.message); });
}

export async function acceptFanInvite(code: string): Promise<{ athleteFirst: string | null; error: string | null }> {
  const { data, error } = await (supabase.rpc as any)('accept_fan_invite', { p_code: parseFanCode(code) });
  if (error) return { athleteFirst: null, error: error.message };
  const r = data as { success: boolean; error?: string; athlete_first_name?: string };
  return r.success ? { athleteFirst: r.athlete_first_name ?? null, error: null } : { athleteFirst: null, error: r.error ?? 'Could not accept the invite' };
}

export async function fetchFanFamily(): Promise<FanTournament[]> {
  const { data } = await (supabase.rpc as any)('my_fan_family');
  return (data as FanTournament[] | null) ?? [];
}

export async function fetchFollowedAthletes(): Promise<{ athlete_id: string; first_name: string }[]> {
  const { data } = await (supabase.rpc as any)('my_followed_athletes');
  return (data as { athlete_id: string; first_name: string }[] | null) ?? [];
}

// The fan code survives sign-up (web reloads on Google sign-in) until accepted.
const KEY = 'rally.pendingFanCode';
let memory: string | null = null;
export function rememberFanCode(code: string) {
  memory = parseFanCode(code);
  if (Platform.OS === 'web') { try { localStorage.setItem(KEY, memory); } catch {} }
}
export function takeFanCode(): string | null {
  let v = memory;
  if (Platform.OS === 'web') { try { v = localStorage.getItem(KEY) ?? v; localStorage.removeItem(KEY); } catch {} }
  memory = null;
  return v;
}
