// Automatic pushes to guests on the app (fans). Pure helpers; the DB work
// lives in lesson-reminders, which runs every 15 minutes.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (ymd: string) => { const [, m, d] = ymd.split('-').map(Number); return `${MON[m - 1]} ${d}`; };
/** "Oct 17–18", "Oct 31–Nov 1", "Oct 17". */
export function shortRange(start: string, end: string): string {
  if (!end || end === start) return md(start);
  return start.slice(0, 7) === end.slice(0, 7) ? `${md(start)}–${Number(end.slice(8))}` : `${md(start)}–${md(end)}`;
}

/** Game-day push goes out from 7am local on each day of the tournament. */
export function gameDayDue(today: string, hour: number, t: { start_date: string; end_date: string; fan_gameday_sent_on: string | null }): boolean {
  return hour >= 7 && hour < 21 && t.start_date <= today && today <= (t.end_date || t.start_date) && t.fan_gameday_sent_on !== today;
}

export function gameDayText(v: { athlete: string; name: string; dayNum: number; days: number; venue?: string | null; stream?: string | null }) {
  const title = v.dayNum === 1 ? `${v.athlete} plays today!` : `${v.name} · Day ${v.dayNum}`;
  const parts = [v.dayNum === 1 ? v.name : `${v.athlete} is back on the court`];
  if (v.venue) parts.push(v.venue);
  if (v.stream) parts.push(`Watch on ${v.stream}`);
  return { title, body: parts.join(' · ') };
}

/** Stream push: only during the event, after that day's game-day push, for a link not yet announced. */
export function streamDue(today: string, t: { start_date: string; end_date: string; fan_gameday_sent_on: string | null; fan_stream_sent_url: string | null }, url?: string | null): boolean {
  return !!url && t.fan_gameday_sent_on === today && t.start_date <= today && today <= (t.end_date || t.start_date) && t.fan_stream_sent_url !== url;
}

export const streamText = (v: { athlete: string; name: string; label: string }) =>
  ({ title: `Watch ${v.athlete} live`, body: `${v.name} stream is up on ${v.label}. Tap to watch.` });

/** One push per athlete, however many tournaments were added. */
export function newTournamentsText(athlete: string, ts: { name: string; start_date: string; end_date: string }[]) {
  const sorted = [...ts].sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (sorted.length === 1) {
    const t = sorted[0];
    return { title: `New on ${athlete}'s schedule`, body: `${t.name}, ${shortRange(t.start_date, t.end_date)}` };
  }
  return { title: `${sorted.length} new tournaments for ${athlete}`, body: `Starting with ${sorted[0].name}, ${shortRange(sorted[0].start_date, sorted[0].end_date)}` };
}

/** Day number of the tournament (1-based) for a local date. */
export function dayNumber(start: string, today: string): number {
  return Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
}
