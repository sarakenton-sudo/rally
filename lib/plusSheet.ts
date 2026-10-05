/**
 * Ordering for the "+" quick-add sheet. PURE: no React, no Supabase — all
 * context is passed in so every rule is unit-tested (lib/__tests__/plusSheet.test.ts).
 *
 * Paste input is always first (not part of this list). Top tier default order
 * is travel → lesson → login. Rules (spec §4):
 *  4.1 tournament within 14 days with travel missing → travel #1
 *  4.2 lesson pattern (≥3 lessons, same coach, same weekday, ±1h, last 6 weeks) → lesson #1 + rebook
 *      tie-break when both match: tournament within 3 days → travel, else lesson
 *  4.3 no athlete / no season → setup prompts shown above the top tier
 *  4.4 no connected coach → lesson never promoted (stays at its default #2)
 */

export type TopItem = 'travel' | 'lesson' | 'login';
export type RuleApplied = '4.1' | '4.2' | '4.3' | 'default';

export interface PlusTournament {
  id: string;
  name: string;
  start_date: string;   // YYYY-MM-DD
  needsTravel: boolean; // no hotel, or a backup hotel still unresolved
}

export interface PlusLesson {
  coachId: string;
  coachName: string;
  startsAt: string;     // ISO
  status: 'confirmed' | 'completed' | 'requested' | 'cancelled' | string;
  sessionTypeId?: string | null;
}

export interface PlusContext {
  now: Date;
  tournaments: PlusTournament[];
  lessons: PlusLesson[];
  connectedCoachCount: number;
  athleteCount: number;
  seasonCount: number;
}

export interface RebookSuggestion {
  coachId: string;
  coachName: string;
  weekday: number;      // 0 = Sunday
  hour: number;
  minute: number;
  sessionTypeId: string | null;
}

export interface PlusSheetOrder {
  topItems: TopItem[];
  rule: RuleApplied;
  setupPrompts: ('add_athlete' | 'add_season')[];
  travelSubtitle: string | null;   // "Northern Lights · 2 days away"
  rebook: RebookSuggestion | null;
}

const DAY = 86_400_000;
const DEFAULT_ORDER: TopItem[] = ['travel', 'lesson', 'login'];

/** Whole days from today (local midnight) to a YYYY-MM-DD date. */
export function daysUntilDate(ymd: string, now: Date): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / DAY);
}

/** Soonest tournament starting in 0–14 days that still needs travel. */
export function findTravelNeed(ctx: PlusContext): { t: PlusTournament; days: number } | null {
  return ctx.tournaments
    .map((t) => ({ t, days: daysUntilDate(t.start_date, ctx.now) }))
    .filter(({ t, days }) => t.needsTravel && days >= 0 && days <= 14)
    .sort((a, b) => a.days - b.days)[0] ?? null;
}

/**
 * Weekly lesson pattern: ≥3 booked/completed lessons with the same coach in
 * the last 6 weeks (plus this coming week) on the same weekday within ±1 hour.
 */
export function findLessonPattern(lessons: PlusLesson[], now: Date): RebookSuggestion | null {
  const from = now.getTime() - 42 * DAY;
  const to = now.getTime() + 7 * DAY;
  const live = lessons.filter((l) => {
    const t = new Date(l.startsAt).getTime();
    return (l.status === 'confirmed' || l.status === 'completed') && t >= from && t <= to;
  });

  let best: { s: RebookSuggestion; count: number } | null = null;
  const byCoach = new Map<string, PlusLesson[]>();
  for (const l of live) byCoach.set(l.coachId, [...(byCoach.get(l.coachId) ?? []), l]);

  for (const [coachId, ls] of byCoach) {
    for (const anchor of ls) {
      const a = new Date(anchor.startsAt);
      const aMin = a.getHours() * 60 + a.getMinutes();
      const group = ls.filter((l) => {
        const d = new Date(l.startsAt);
        return d.getDay() === a.getDay() && Math.abs(d.getHours() * 60 + d.getMinutes() - aMin) <= 60;
      });
      if (group.length >= 3 && (!best || group.length > best.count)) {
        // Suggest the most recent occurrence's time and session type.
        const latest = [...group].sort((x, y) => y.startsAt.localeCompare(x.startsAt))[0];
        const ld = new Date(latest.startsAt);
        best = {
          count: group.length,
          s: {
            coachId, coachName: latest.coachName, weekday: ld.getDay(),
            hour: ld.getHours(), minute: ld.getMinutes(), sessionTypeId: latest.sessionTypeId ?? null,
          },
        };
      }
    }
  }
  return best?.s ?? null;
}

export function getPlusSheetOrder(ctx: PlusContext): PlusSheetOrder {
  const setupPrompts: PlusSheetOrder['setupPrompts'] = [];
  if (ctx.athleteCount === 0) setupPrompts.push('add_athlete');
  if (ctx.seasonCount === 0) setupPrompts.push('add_season');

  const travel = findTravelNeed(ctx);
  // 4.4: never promote lessons for a family with no coach.
  const rebook = ctx.connectedCoachCount > 0 ? findLessonPattern(ctx.lessons, ctx.now) : null;

  let first: TopItem | null = null;
  let rule: RuleApplied = 'default';
  if (travel && rebook) {
    first = travel.days <= 3 ? 'travel' : 'lesson';
    rule = first === 'travel' ? '4.1' : '4.2';
  } else if (travel) {
    first = 'travel'; rule = '4.1';
  } else if (rebook) {
    first = 'lesson'; rule = '4.2';
  } else if (setupPrompts.length) {
    rule = '4.3';
  }

  const topItems = first ? [first, ...DEFAULT_ORDER.filter((i) => i !== first)] : [...DEFAULT_ORDER];
  const travelSubtitle = travel
    ? `${travel.t.name} · ${travel.days === 0 ? 'today' : travel.days === 1 ? 'tomorrow' : `${travel.days} days away`}`
    : null;
  return { topItems, rule, setupPrompts, travelSubtitle, rebook };
}
