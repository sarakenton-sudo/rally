/**
 * Ordering for the coach "+" sheet. PURE — unit-tested in lib/__tests__/coachPlus.test.ts.
 *
 * Top tier default order (adding clients is the growth loop, so it leads):
 *   add_client → invite_family → open_time → book_family → record_payment → share_link
 * Labels: add_client "Add a client", invite_family "Invite a client",
 * book_family "Book a lesson" (existing athlete).
 * Context (first match wins the #1 slot; the rest keep default order):
 *   1. a lesson ended today and is unpaid       → record_payment
 *   2. nothing open in the next 7 days           → open_time
 * Pending requests never reorder the list; they show as a "Review N requests"
 * prompt above it (the action is review, not create).
 */
export type CoachTopItem = 'add_client' | 'invite_family' | 'open_time' | 'book_family' | 'record_payment' | 'share_link';
export type CoachRule = 'unpaid_today' | 'no_open_time' | 'default';

export interface CoachPlusContext {
  now: Date;
  pendingRequests: number;
  openSlotsNext7Days: number;
  /** Lessons that already ended (end time ≤ now) and aren't paid, with their end times. */
  unpaidEndedLessons: { endsAt: string }[];
}

export interface CoachPlusOrder {
  topItems: CoachTopItem[];
  rule: CoachRule;
  reviewPrompt: number;   // pending requests to show above the list (0 = none)
}

const DEFAULT: CoachTopItem[] = ['add_client', 'invite_family', 'open_time', 'book_family', 'record_payment', 'share_link'];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function getCoachPlusOrder(ctx: CoachPlusContext): CoachPlusOrder {
  const unpaidToday = ctx.unpaidEndedLessons.some((l) => {
    const end = new Date(l.endsAt);
    return end.getTime() <= ctx.now.getTime() && sameDay(end, ctx.now);
  });
  let first: CoachTopItem | null = null;
  let rule: CoachRule = 'default';
  if (unpaidToday) { first = 'record_payment'; rule = 'unpaid_today'; }
  else if (ctx.openSlotsNext7Days === 0) { first = 'open_time'; rule = 'no_open_time'; }
  return {
    topItems: first ? [first, ...DEFAULT.filter((i) => i !== first)] : [...DEFAULT],
    rule,
    reviewPrompt: Math.max(ctx.pendingRequests, 0),
  };
}
