import { supabase } from '@/lib/supabase';

/** A game or team event (team_events; games come from the AI schedule import). */
export interface ScheduleGame {
  id: string;
  season_id: string;
  name: string;
  date: string;                 // YYYY-MM-DD
  time: string | null;          // HH:MM[:SS]
  venue_name: string;
  address: string;
  event_type: 'game' | 'event' | 'practice';
  opponent: string | null;
  home_away: 'home' | 'away' | null;
  notes: string | null;
}

/** Upcoming games and team events (today onward), oldest first. RLS limits to the family's teams. */
export async function fetchUpcomingGames(): Promise<ScheduleGame[]> {
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { data } = await (supabase.from('team_events') as any)
    .select('id, season_id, name, date, time, venue_name, address, event_type, opponent, home_away, notes')
    .gte('date', ymd)
    .order('date')
    .order('time', { nullsFirst: false });
  return (data as ScheduleGame[] | null) ?? [];
}

/** "vs Rouse" / "@ Bowie" / the event's own name. */
export function gameTitle(g: Pick<ScheduleGame, 'name' | 'opponent' | 'home_away' | 'event_type'>): string {
  if (g.event_type === 'game' && g.opponent) return `${g.home_away === 'away' ? '@' : 'vs'} ${g.opponent}`;
  return g.name;
}

/** "5:30 PM" from "17:30:00". */
export function formatGameTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Delete a game or team event (swipe left on Home). */
export async function deleteTeamEvent(id: string): Promise<{ error: Error | null }> {
  const { data, error } = await (supabase.from('team_events') as any).delete().eq('id', id).select('id');
  if (error) return { error };
  return { error: data?.length ? null : new Error("Couldn't delete this game. Only parents who manage the team can.") };
}
