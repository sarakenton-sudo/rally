import type { CalEvent } from '@/lib/calendarFormat';
import type { FanTournament, FanGame } from '@/lib/fan';
import { gameTitle } from '@/lib/teamEvents';

// Calendar entries for fans: where to go, the stream and the team code.

export function fanTournamentEvent(t: FanTournament): CalEvent {
  const venue = t.venues?.find((v) => v.is_confirmed) ?? t.venues?.[0];
  const stream = t.streaming_links?.[0]?.url ?? t.default_stream_url;
  const notes = [
    `${t.athlete_first_name} · ${t.team_name}`,
    t.team_code ? `Team code: ${t.team_code}` : null,
    stream ? `Watch live: ${stream}` : null,
    t.ticket_link ? `Tickets: ${t.ticket_link}` : null,
  ].filter(Boolean).join('\n');
  return { allDay: true, title: `${t.name} (${t.athlete_first_name})`, startDate: t.start_date, endDate: t.end_date || t.start_date, location: venue?.address || venue?.label || t.location_city, notes };
}

export function fanGameEvent(g: FanGame): CalEvent {
  const title = `${gameTitle(g)} (${g.athlete_first_name})`;
  const notes = `${g.athlete_first_name} · ${g.team_name}`;
  const where = g.address || g.venue_name || null;
  if (!g.time) return { allDay: true, title, startDate: g.date, endDate: g.date, location: where, notes };
  const start = new Date(`${g.date}T${g.time.length === 5 ? `${g.time}:00` : g.time}`);
  const end = new Date(start.getTime() + 2 * 3600_000);
  return { allDay: false, title, start: start.toISOString(), end: end.toISOString(), location: where, notes };
}
