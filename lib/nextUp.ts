// Home "Next up": the one thing the family should be looking at.
// Pure logic (no React Native) — see lib/__tests__/nextUp.test.ts.

export interface NextUpTournament { id: string; start_date: string; end_date: string }
export interface NextUpLesson { id: string; starts_at: string; status: string }

export type NextUp =
  | { kind: 'tournament'; id: string; daysAway: number; live: boolean; gameDay: boolean }
  | { kind: 'lesson'; id: string; startsAt: string }
  | null;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000);

/** Game-day view starts this many days before a tournament (travel day / night before). */
export const GAME_DAY_LEAD_DAYS = 1;

export function pickNextUp(tournaments: NextUpTournament[], lessons: NextUpLesson[], now = new Date()): NextUp {
  const today = ymd(now);

  // A tournament in progress always wins.
  const live = tournaments
    .filter((t) => t.start_date <= today && t.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  if (live) return { kind: 'tournament', id: live.id, daysAway: 0, live: true, gameDay: true };

  const nextT = tournaments
    .filter((t) => t.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const nextL = lessons
    .filter((l) => (l.status === 'accepted' || l.status === 'requested') && Date.parse(l.starts_at) > now.getTime())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  // Compare a tournament (all-day, local midnight) with a lesson (exact time).
  const tTime = nextT ? Date.parse(`${nextT.start_date}T00:00:00`) : Infinity;
  const lTime = nextL ? Date.parse(nextL.starts_at) : Infinity;
  if (nextT && tTime <= lTime) {
    const daysAway = dayDiff(today, nextT.start_date);
    return { kind: 'tournament', id: nextT.id, daysAway, live: false, gameDay: daysAway <= GAME_DAY_LEAD_DAYS };
  }
  if (nextL) return { kind: 'lesson', id: nextL.id, startsAt: nextL.starts_at };
  return null;
}

/** "Invite your coach" prompt in Needs you: families with no coach, not nagged more than monthly. */
export function showCoachInvitePrompt(o: { hasCoaches: boolean; lastInviteAt: string | null; dismissedAt: string | null; now?: Date }) {
  if (o.hasCoaches) return false;
  const now = (o.now ?? new Date()).getTime();
  const recent = (iso: string | null) => !!iso && now - Date.parse(iso) < 30 * 86_400_000;
  return !recent(o.lastInviteAt) && !recent(o.dismissedAt);
}

export function countdownLabel(daysAway: number) {
  if (daysAway <= 0) return 'Today';
  if (daysAway === 1) return 'Tomorrow';
  return `In ${daysAway} days`;
}

/** Group a date-sorted timeline into month sections ("NOVEMBER", or "JANUARY 2027" when the year changes). */
export function groupByMonth<T extends { date: string }>(items: T[], now = new Date()): { key: string; label: string; items: T[] }[] {
  const out: { key: string; label: string; items: T[] }[] = [];
  for (const it of items) {
    const key = it.date.slice(0, 7);
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      const [y, m] = key.split('-').map(Number);
      const name = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long' }).toUpperCase();
      g = { key, label: y === now.getFullYear() ? name : `${name} ${y}`, items: [] };
      out.push(g);
    }
    g.items.push(it);
  }
  return out;
}
