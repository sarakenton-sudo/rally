// Pure calendar helpers (no React Native) — see lib/__tests__/calendarFormat.test.ts.
// Google template links, .ics files, and which device calendar to write into.

export type CalEvent =
  | { allDay: true; title: string; startDate: string; endDate: string; location?: string | null; notes?: string | null } // YYYY-MM-DD, end inclusive
  | { allDay: false; title: string; start: string; end: string; location?: string | null; notes?: string | null };      // ISO date-times

export type CalendarTarget = 'google' | 'apple' | 'ics';

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → local midnight (not UTC, which shifts the day in US timezones). */
export const localDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** 'YYYY-MM-DD' + n days → 'YYYYMMDD' (calendar math, no timezone drift). */
export function compactYmdPlus(ymd: string, days = 0): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

/** ISO date-time → 'YYYYMMDDTHHMMSSZ' (UTC). */
export function compactUtc(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Google Calendar "add event" link (the user reviews and saves). All-day end is exclusive. */
export function googleTemplateUrl(e: CalEvent): string {
  const dates = e.allDay
    ? `${compactYmdPlus(e.startDate)}/${compactYmdPlus(e.endDate, 1)}`
    : `${compactUtc(e.start)}/${compactUtc(e.end)}`;
  const q = [
    ['action', 'TEMPLATE'], ['text', e.title], ['dates', dates],
    ['location', e.location ?? ''], ['details', e.notes ?? ''],
  ].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** Where Google lets you import an .ics file (no bulk-add link exists). */
export const GOOGLE_IMPORT_URL = 'https://calendar.google.com/calendar/u/0/r/settings/export';

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Stable id so re-importing the same event updates instead of duplicating (Google/Apple honor UID). */
export function eventUid(e: CalEvent): string {
  const key = `${e.title}|${e.allDay ? e.startDate : e.start}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `rally-${(h >>> 0).toString(36)}@rally-hub.com`;
}

/** One .ics file for any number of events (CRLF line endings per RFC 5545). */
export function buildIcs(events: CalEvent[], now = new Date()): string {
  const stamp = compactUtc(now.toISOString());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RallyHUB//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${eventUid(e)}`, `DTSTAMP:${stamp}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${compactYmdPlus(e.startDate)}`, `DTEND;VALUE=DATE:${compactYmdPlus(e.endDate, 1)}`);
    else lines.push(`DTSTART:${compactUtc(e.start)}`, `DTEND:${compactUtc(e.end)}`);
    lines.push(`SUMMARY:${icsEscape(e.title)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.notes) lines.push(`DESCRIPTION:${icsEscape(e.notes)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** https feed → webcal:// so Apple Calendar offers "Subscribe". */
export const webcalUrl = (httpsUrl: string) => httpsUrl.replace(/^https?:/, 'webcal:');

// ---- Picking a device calendar (expo-calendar shapes, simplified) ----

export interface DeviceSource { id?: string; name: string; type: string; isLocalAccount?: boolean }
export interface DeviceCalendar { id: string; title: string; allowsModifications: boolean; source: DeviceSource; type?: string }

export const RALLY_CALENDAR_TITLE = 'RallyHUB';
const NEVER = /^(subscribed|birthdays)$/i;
const isGoogle = (c: DeviceCalendar) => /google|gmail/i.test(c.source?.name ?? '') || /com\.google/i.test(c.source?.type ?? '');

/** The user's Google calendar on this phone (iOS: added under Settings → Calendar → Accounts). Primary first. */
export function findGoogleCalendar(cals: DeviceCalendar[]): DeviceCalendar | null {
  const g = cals.filter((c) => c.allowsModifications && isGoogle(c) && !NEVER.test(c.source?.type ?? ''));
  return g.find((c) => c.title === c.source.name) ?? g.find((c) => /@/.test(c.title)) ?? g[0] ?? null;
}

/** Our own calendar, if we made it before. Never a shared/subscribed calendar like "Drue's School". */
export function findRallyCalendar(cals: DeviceCalendar[]): DeviceCalendar | null {
  return cals.find((c) => c.title === RALLY_CALENDAR_TITLE && c.allowsModifications) ?? null;
}

/** Account to create the RallyHUB calendar in: iCloud, then On My iPhone, then the default calendar's account. */
export function pickSourceForNewCalendar(sources: DeviceSource[], defaultCalendar: DeviceCalendar | null): DeviceSource | null {
  const ok = sources.filter((s) => !NEVER.test(s.type));
  return ok.find((s) => /caldav/i.test(s.type) && /icloud/i.test(s.name))
    ?? ok.find((s) => /local/i.test(s.type))
    ?? (defaultCalendar?.allowsModifications && !NEVER.test(defaultCalendar.source.type) ? defaultCalendar.source : null)
    ?? null;
}

/** Skip events already in the calendar (same title + start), so "Add all" twice doesn't duplicate. */
export function withoutDuplicates(events: CalEvent[], existing: { title: string; startDate: string | Date }[]): CalEvent[] {
  const startKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const have = new Set(existing.map((x) => `${x.title}|${startKey(new Date(x.startDate))}`));
  return events.filter((e) => !have.has(`${e.title}|${startKey(e.allDay ? localDate(e.startDate) : new Date(e.start))}`));
}

export function targetLabel(t: CalendarTarget, platform: string): string {
  if (t === 'google') return 'Google Calendar';
  if (t === 'apple') return platform === 'android' ? 'Phone calendar' : 'Apple Calendar';
  return 'Download .ics (Outlook, others)';
}

/** Choices shown per platform. Native can't save files, so no .ics there. */
export function targetsFor(platform: string): CalendarTarget[] {
  return platform === 'web' ? ['google', 'apple', 'ics'] : ['google', 'apple'];
}

/** Calendar titles start with the athlete: "Drue: Lone Star Classic". */
export function withAthlete(athlete: string | null | undefined, title: string): string {
  return athlete ? `${athlete}: ${title}` : title;
}
