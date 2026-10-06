// family-calendar-feed: public iCal feed of a family's tournaments and games.
// Google/Apple Calendar subscribe to this URL and re-poll it, so it works
// without a JWT — deploy with --no-verify-jwt. The unguessable per-family
// token (family_calendar_feeds) is the only credential.
//   GET /functions/v1/family-calendar-feed?token=<uuid>
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (d: string) => d.replace(/-/g, '');
const nextDay = (d: string) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
// Fold long lines at 75 octets (RFC 5545).
const fold = (line: string) => line.length <= 74 ? line : line.match(/.{1,73}/g)!.join('\r\n ');

serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!UUID_RE.test(token)) return new Response('Not found', { status: 404 });
  const { data: feed } = await db.from('family_calendar_feeds').select('admin_config_id, admin_config(user_id)').eq('token', token).maybeSingle();
  const ownerId = (feed as any)?.admin_config?.user_id;
  if (!ownerId) return new Response('Not found', { status: 404 });

  const { data: links } = await db.from('admin_athletes').select('athlete_id, athletes(first_name)').eq('admin_id', ownerId);
  const athleteIds = (links ?? []).map((l: any) => l.athlete_id);
  const nameOf = new Map((links ?? []).map((l: any) => [l.athlete_id, l.athletes?.first_name ?? '']));
  const multi = athleteIds.length > 1;
  const { data: seasons } = athleteIds.length
    ? await db.from('seasons').select('id, team_name, athlete_id').in('athlete_id', athleteIds)
    : { data: [] as any[] };
  const seasonIds = (seasons ?? []).map((s: any) => s.id);
  const seasonOf = new Map((seasons ?? []).map((s: any) => [s.id, s]));
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);   // keep ~2 months of history

  const [{ data: tours }, { data: games }] = seasonIds.length ? await Promise.all([
    db.from('tournaments').select('id, name, start_date, end_date, location_city, venues, season_id').in('season_id', seasonIds).gte('end_date', since),
    db.from('team_events').select('id, name, date, time, venue_name, address, opponent, home_away, event_type, season_id').in('season_id', seasonIds).gte('date', since),
  ]) : [{ data: [] }, { data: [] }];

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RallyHUB//Family//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:RallyHUB', 'X-PUBLISHED-TTL:PT6H', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H'];
  for (const t of (tours ?? []) as any[]) {
    const s = seasonOf.get(t.season_id) as any;
    const who = multi && s ? ` (${nameOf.get(s.athlete_id)})` : '';
    const venue = (t.venues ?? []).find((v: any) => v.is_confirmed) ?? (t.venues ?? [])[0];
    out.push('BEGIN:VEVENT', `UID:t-${t.id}@rally-hub.com`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(t.start_date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(t.end_date))}`,
      fold(`SUMMARY:${esc(`${t.name}${who}`)}`),
      fold(`LOCATION:${esc([venue?.label, venue?.address || t.location_city].filter(Boolean).join(', '))}`),
      fold(`DESCRIPTION:${esc(`${s?.team_name ?? ''} · Details in RallyHUB: https://rally-hub.com/app`)}`),
      'END:VEVENT');
  }
  for (const g of (games ?? []) as any[]) {
    const s = seasonOf.get(g.season_id) as any;
    const who = multi && s ? ` (${nameOf.get(s.athlete_id)})` : '';
    const title = g.event_type === 'game' && g.opponent ? `${g.home_away === 'away' ? '@' : 'vs'} ${g.opponent}` : g.name;
    out.push('BEGIN:VEVENT', `UID:g-${g.id}@rally-hub.com`, `DTSTAMP:${stamp}`);
    if (g.time) {
      // Floating local time (no zone): shows at the listed time wherever the family is.
      const [h, m] = String(g.time).split(':');
      const start = `${ymd(g.date)}T${h.padStart(2, '0')}${(m ?? '00').padStart(2, '0')}00`;
      const endH = String(Math.min(23, Number(h) + 2)).padStart(2, '0');
      out.push(`DTSTART:${start}`, `DTEND:${ymd(g.date)}T${endH}${(m ?? '00').padStart(2, '0')}00`);
    } else {
      out.push(`DTSTART;VALUE=DATE:${ymd(g.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(g.date))}`);
    }
    out.push(fold(`SUMMARY:${esc(`${title}${who}${s ? ` · ${s.team_name}` : ''}`)}`),
      fold(`LOCATION:${esc([g.venue_name, g.address].filter(Boolean).join(', '))}`), 'END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return new Response(out.join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, max-age=900', 'Content-Disposition': 'inline; filename="rallyhub.ics"' },
  });
});
