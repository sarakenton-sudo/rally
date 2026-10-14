// Family reminders (tournaments, games, lessons), by kid. Pure helpers; the
// DB work is in lesson-reminders, which runs every 15 minutes.

export type FamilyItem = {
  kind: 'tournament' | 'game' | 'lesson';
  athlete: string;          // first name
  title: string;            // "Lone Star Classic", "@ Westlake", "Private Lesson with Ben"
  day: string;              // YYYY-MM-DD (local)
  time?: string | null;     // "6:30 PM CT" (games/lessons)
};

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = (ymd: string) => DOW[new Date(`${ymd}T12:00:00Z`).getUTCDay()];

/** Night before: 7–9 PM local, once per person per day. */
export const nightBeforeDue = (hour: number) => hour >= 19 && hour < 21;
/** Week ahead: Sunday 6–9 PM local. */
export const weekAheadDue = (weekday: number, hour: number) => weekday === 0 && hour >= 18 && hour < 21;

const line = (i: FamilyItem, withDay: boolean) =>
  `${i.athlete}: ${i.title}${withDay ? ` ${dow(i.day)}` : ''}${i.time ? ` ${i.time}` : ''}`;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function nightBeforeText(items: FamilyItem[]) {
  const sorted = [...items].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  return { title: 'Tomorrow', body: sorted.map((i) => line(i, false)).join(' · ') };
}

export function weekAheadText(items: FamilyItem[]) {
  const sorted = [...items].sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '').localeCompare(b.time ?? ''));
  const counts = (['tournament', 'game', 'lesson'] as const)
    .map((k) => [k, sorted.filter((i) => i.kind === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => plural(n, k));
  const shown = sorted.slice(0, 5).map((i) => line(i, true));
  const more = sorted.length > 5 ? ` · +${sorted.length - 5} more` : '';
  return { title: `Your week: ${counts.join(', ')}`, body: shown.join(' · ') + more };
}

const ZONE_SHORT: Record<string, string> = {
  'America/New_York': 'ET', 'America/Chicago': 'CT', 'America/Denver': 'MT', 'America/Phoenix': 'AZ',
  'America/Los_Angeles': 'PT', 'America/Anchorage': 'AKT', 'Pacific/Honolulu': 'HT',
};
/** "18:30:00" + zone → "6:30 PM CT". */
export function gameTimeLabel(t: string | null | undefined, tz?: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  const z = tz ? ZONE_SHORT[tz] : '';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}${z ? ` ${z}` : ''}`;
}
