import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { SITE_URL } from '@/lib/config';

// Fans (00095): friends and family who follow a family's athletes in the app.
// Read-only: tournaments and games. Each invite has its own one-time code.

// Where "get the app" links go. While RallyHUB is in TestFlight this is the
// public TestFlight link; switch back to the App Store link at launch:
//   https://apps.apple.com/app/id6762097230
export const APP_STORE_URL = 'https://testflight.apple.com/join/cfEYHwkd';
export const fanInviteUrl = (code: string) => `${SITE_URL}/fan/${code}`;

/** The text the parent pastes into Messages: what it is, the app link, and their code. */
export function fanInviteMessage(fanFirst: string, athleteNames: string, code: string) {
  const hi = fanFirst ? `Hi ${fanFirst}! ` : '';
  return `${hi}Follow ${athleteNames}'s volleyball season on RallyHUB: tournament and game dates, locations and live streams, with alerts on game day. It's free.\n\n` +
    `1. Get the app: ${APP_STORE_URL}\n2. Sign up as a Fan and enter code ${code}\n\nOr tap ${fanInviteUrl(code)}`;
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
  /** Latest update the parent sent guests (push), for anyone who missed it. */
  latest_update?: string | null; latest_update_at?: string | null;
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

export interface Fan { id: string; name: string; invite_code: string; fan_user_id: string | null; joined_at: string | null; created_at: string }

/** Create an invite for a new fan; returns their one-time code. */
export async function createFanInvite(name: string): Promise<{ fan: { id: string; code: string } | null; error: string | null }> {
  const { data, error } = await (supabase.rpc as any)('create_fan_invite', { p_name: name });
  if (error) return { fan: null, error: error.message };
  return { fan: data as { id: string; code: string }, error: null };
}

/** The family's fans (co-parents see each other's), newest first. */
export async function fetchFans(): Promise<Fan[]> {
  const { data } = await (supabase.from('fans') as any)
    .select('id, name, invite_code, fan_user_id, joined_at, created_at').order('created_at', { ascending: false });
  return (data as Fan[] | null) ?? [];
}

/** Remove a fan: they stop seeing the family right away. */
export async function removeFan(id: string): Promise<{ error: string | null }> {
  const { error } = await (supabase.from('fans') as any).delete().eq('id', id);
  return { error: error?.message ?? null };
}

/** Is this a real, unused code? (sign-up checks before creating the account) */
export async function checkFanCode(code: string): Promise<{ ok: boolean; athletes: string | null }> {
  const { data } = await (supabase.rpc as any)('get_fan_invite', { p_code: parseFanCode(code) });
  const d = data as { athlete_first_name: string | null; joined: boolean } | null;
  return { ok: !!d && !d.joined, athletes: d?.athlete_first_name ?? null };
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

export interface FanGame {
  id: string; name: string; date: string; time: string | null; venue_name: string; address: string;
  event_type: 'game' | 'event' | 'practice'; opponent: string | null; home_away: 'home' | 'away' | null;
  team_name: string; athlete_id: string; athlete_first_name: string;
}
export async function fetchFanGames(): Promise<FanGame[]> {
  const { data } = await (supabase.rpc as any)('my_fan_games');
  return (data as FanGame[] | null) ?? [];
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
