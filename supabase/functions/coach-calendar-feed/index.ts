// coach-calendar-feed: public iCal feed of a coach's booked + pending lessons.
// Google/Apple Calendar subscribe to this URL and re-poll it, so it must work
// without a JWT — deploy with --no-verify-jwt. The unguessable per-coach token
// (coach_calendar_feeds) is the only credential.
//   GET /functions/v1/coach-calendar-feed?token=<uuid>
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Attendee {
  kind: 'booking' | 'request';
  status: string;
  athlete_name: string;
  parent_name: string | null;
  session_type: string | null;
  notes: string | null;
  film_links: string[] | null;
}

interface Item {
  slot_id: string;
  starts_at: string;
  ends_at: string;
  seats_total: number;
  facility_label: string | null;
  facility_address: string | null;
  status: 'booked' | 'pending';
  attendees: Attendee[];
}

// RFC 5545 helpers
const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines must be folded at 75 octets.
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (curLen + len > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function toEvent(item: Item, stamp: string): string[] {
  const live = item.attendees.filter((a) => a.kind === 'booking');
  const shown = live.length ? live : item.attendees;
  const names = shown.map((a) => a.athlete_name);
  const type = shown[0]?.session_type ?? 'Lesson';
  const who = names.length <= 2 ? names.join(' & ') : `${names.length} athletes`;
  const summary = `${item.status === 'pending' ? 'PENDING: ' : ''}${type} — ${who}`;

  const desc = item.attendees.map((a) => {
    const parts = [`${a.athlete_name}${a.kind === 'request' ? ' (request — not yet accepted)' : ''}`];
    if (a.parent_name) parts.push(`Parent: ${a.parent_name}`);
    if (a.session_type) parts.push(`Type: ${a.session_type}`);
    if (a.notes) parts.push(`Work on: ${a.notes}`);
    if (a.film_links?.length) parts.push(`Film: ${a.film_links.join(' ')}`);
    return parts.join('\n');
  }).join('\n\n') + '\n\nManage in RallyHUB → Coaching → Schedule';

  const location = [item.facility_label, item.facility_address].filter(Boolean).join(', ');

  return [
    'BEGIN:VEVENT',
    `UID:rally-slot-${item.slot_id}@rally-hub.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsDate(item.starts_at)}`,
    `DTEND:${icsDate(item.ends_at)}`,
    `SUMMARY:${esc(summary)}`,
    ...(location ? [`LOCATION:${esc(location)}`] : []),
    `DESCRIPTION:${esc(desc)}`,
    `STATUS:${item.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED'}`,
    'END:VEVENT',
  ];
}

serve(async (req: Request) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!UUID_RE.test(token)) return new Response('Not found', { status: 404 });

  const { data: feed } = await supabaseAdmin
    .from('coach_calendar_feeds')
    .select('coach_id, coaches(display_name)')
    .eq('token', token)
    .maybeSingle();
  if (!feed) return new Response('Not found', { status: 404 });

  const now = Date.now();
  const { data, error } = await supabaseAdmin.rpc('coach_schedule_items', {
    p_coach_id: feed.coach_id,
    p_from: new Date(now - 30 * DAY_MS).toISOString(),
    p_to: new Date(now + 365 * DAY_MS).toISOString(),
  });
  if (error) {
    console.error('[coach-calendar-feed]', error.message);
    return new Response('Feed unavailable', { status: 500 });
  }

  const coachName = (feed as any).coaches?.display_name ?? 'Coach';
  const stamp = icsDate(new Date(now).toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RallyHUB//Coach Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`RallyHUB Lessons — ${coachName}`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...((data as Item[]) ?? []).flatMap((item) => toEvent(item, stamp)),
    'END:VCALENDAR',
  ];

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="rally-lessons.ics"',
      'Cache-Control': 'no-cache',
    },
  });
});
