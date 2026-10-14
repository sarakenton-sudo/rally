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
  // Optional scope: ?athlete=<id> (one athlete) or ?season=<id> (one team). Only the family's own.
  const url = new URL(req.url);
  const onlyAthlete = url.searchParams.get('athlete');
  const onlySeason = url.searchParams.get('season');
  let athleteIds = (links ?? []).map((l: any) => l.athlete_id);
  if (onlyAthlete) athleteIds = athleteIds.filter((id: string) => id === onlyAthlete);
  const nameOf = new Map((links ?? []).map((l: any) => [l.athlete_id, l.athletes?.first_name ?? '']));
  const multi = athleteIds.length > 1;
  const { data: seasons } = athleteIds.length
    ? await db.from('seasons').select('id, team_name, athlete_id').in('athlete_id', athleteIds)
    : { data: [] as any[] };
  const scoped = (seasons ?? []).filter((x: any) => !onlySeason || x.id === onlySeason);
  const seasonIds = scoped.map((s: any) => s.id);
  // A team-only calendar: that team's athlete (their lessons are included too).
  if (onlySeason) athleteIds = athleteIds.filter((id: string) => scoped.some((x: any) => x.athlete_id === id));
  const seasonOf = new Map((seasons ?? []).map((s: any) => [s.id, s]));
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);   // keep ~2 months of history

  const [{ data: tours }, { data: games }] = seasonIds.length ? await Promise.all([
    db.from('tournaments').select('id, name, start_date, end_date, location_city, venues, season_id').in('season_id', seasonIds).gte('end_date', since),
    db.from('team_events').select('*').in('season_id', seasonIds).gte('date', since),
  ]) : [{ data: [] }, { data: [] }];
  // Lessons (requested or confirmed; cancelled ones drop off).
  const { data: lessons } = athleteIds.length
    ? await db.from('booking_requests')
        .select('id, status, athlete_id, session_types(name), coaches(display_name), slots!inner(starts_at, ends_at, facilities(label, address)), bookings(status)')
        .in('athlete_id', athleteIds).in('status', ['requested', 'accepted']).gte('slots.starts_at', `${since}T00:00:00Z`)
    : { data: [] as any[] };

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RallyHUB//Family//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(onlySeason && scoped[0] ? `RallyHUB · ${nameOf.get(scoped[0].athlete_id) ?? ''} ${scoped[0].team_name}`.trim() : onlyAthlete && nameOf.get(onlyAthlete) ? `RallyHUB · ${nameOf.get(onlyAthlete)}` : 'RallyHUB')}`, 'X-PUBLISHED-TTL:PT6H', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H'];
  for (const t of (tours ?? []) as any[]) {
    const s = seasonOf.get(t.season_id) as any;
    const who = s && nameOf.get(s.athlete_id) ? `${nameOf.get(s.athlete_id)}: ` : '';
    const venue = (t.venues ?? []).find((v: any) => v.is_confirmed) ?? (t.venues ?? [])[0];
    out.push('BEGIN:VEVENT', `UID:t-${t.id}@rally-hub.com`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(t.start_date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(t.end_date))}`,
      fold(`SUMMARY:${esc(`${who}${t.name}`)}`),
      fold(`LOCATION:${esc([venue?.label, venue?.address || t.location_city].filter(Boolean).join(', '))}`),
      fold(`DESCRIPTION:${esc(`${s?.team_name ?? ''} · Details in RallyHUB: https://rally-hub.com`)}`),
      'END:VEVENT');
  }
  for (const g of (games ?? []) as any[]) {
    const s = seasonOf.get(g.season_id) as any;
    const who = s && nameOf.get(s.athlete_id) ? `${nameOf.get(s.athlete_id)}: ` : '';
    const title = g.event_type === 'game' && g.opponent ? `${g.home_away === 'away' ? '@' : 'vs'} ${g.opponent}` : g.name;
    out.push('BEGIN:VEVENT', `UID:g-${g.id}@rally-hub.com`, `DTSTAMP:${stamp}`);
    if (g.time) {
      // Floating local time (no zone): shows at the listed time wherever the family is.
      const [h, m] = String(g.time).split(':');
      const start = `${ymd(g.date)}T${h.padStart(2, '0')}${(m ?? '00').padStart(2, '0')}00`;
      const endH = String(Math.min(23, Number(h) + 2)).padStart(2, '0');
      // With a time zone (00104), pin it there; without, floating local time.
      const tz = g.timezone ? `;TZID=${g.timezone}` : '';
      out.push(`DTSTART${tz}:${start}`, `DTEND${tz}:${ymd(g.date)}T${endH}${(m ?? '00').padStart(2, '0')}00`);
    } else {
      out.push(`DTSTART;VALUE=DATE:${ymd(g.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(g.date))}`);
    }
    out.push(fold(`SUMMARY:${esc(`${who}${title}${s ? ` · ${s.team_name}` : ''}`)}`),
      fold(`LOCATION:${esc([g.venue_name, g.address].filter(Boolean).join(', '))}`), 'END:VEVENT');
  }
  const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  for (const l of (lessons ?? []) as any[]) {
    if ((l.bookings ?? []).some((b: any) => b.status === 'cancelled')) continue;
    const who = nameOf.get(l.athlete_id) ? `${nameOf.get(l.athlete_id)}: ` : '';
    const what = `${l.session_types?.name ?? 'Lesson'} with ${l.coaches?.display_name ?? 'coach'}${l.status === 'requested' ? ' (requested)' : ''}`;
    const fac = l.slots?.facilities;
    out.push('BEGIN:VEVENT', `UID:l-${l.id}@rally-hub.com`, `DTSTAMP:${stamp}`,
      `DTSTART:${utc(l.slots.starts_at)}`, `DTEND:${utc(l.slots.ends_at)}`,
      fold(`SUMMARY:${esc(`${who}${what}`)}`),
      fold(`LOCATION:${esc([fac?.label, fac?.address].filter(Boolean).join(', '))}`), 'END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return new Response(out.join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, max-age=900', 'Content-Disposition': 'inline; filename="rallyhub.ics"' },
  });
});
