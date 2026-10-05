// Coach Today screen logic. Pure — unit-tested in lib/__tests__/coachToday.test.ts.
// Keep React Native and Supabase out of this file.

export interface TodayAttendee {
  kind: 'booking' | 'request';
  status: string;
  price_cents?: number | null;
  payment_status?: string | null;
}
export interface TodayItem {
  slot_id: string;
  starts_at: string;
  ends_at: string;
  status: 'booked' | 'pending';
  attendees: TodayAttendee[];
}
export interface TodaySlot {
  id: string;
  starts_at: string;
  status: string;
  seats_total: number;
  seats_taken: number;
  facility_status?: string | null;
}

export interface MoneyStrip {
  booked: number;     // confirmed lessons this week ($ cents), cancelled excluded
  collected: number;  // of those, paid
  unpaid: number;     // lessons that already happened and aren't paid (or refunded)
  lessons: number;    // confirmed attendees this week (a group lesson counts each athlete)
  openSpots: number;  // unbooked seats in this week's remaining open blocks (a count, not $)
}

const live = (a: TodayAttendee) => a.kind === 'booking' && a.status !== 'cancelled';

/**
 * The week's money: what's booked, what's collected, what's owed.
 * Unbooked capacity is shown as spots, never dollars — it isn't money yet.
 */
export function moneyStrip(items: TodayItem[], slots: TodaySlot[], now = new Date()): MoneyStrip {
  const s: MoneyStrip = { booked: 0, collected: 0, unpaid: 0, lessons: 0, openSpots: 0 };
  for (const item of items) {
    for (const a of item.attendees.filter(live)) {
      const price = a.price_cents ?? 0;
      s.lessons += 1;
      s.booked += price;
      if (a.payment_status === 'captured') s.collected += price;
      else if (a.payment_status !== 'refunded' && Date.parse(item.ends_at) <= now.getTime()) s.unpaid += price;
    }
  }
  for (const sl of slots) {
    if (sl.status === 'blocked' || Date.parse(sl.starts_at) < now.getTime()) continue;
    s.openSpots += Math.max(sl.seats_total - sl.seats_taken, 0);
  }
  return s;
}

/** Booked blocks in the next 7 days whose gym isn't reserved yet. */
export function gymsToBook(slots: TodaySlot[], now = new Date()): number {
  const until = now.getTime() + 7 * 86_400_000;
  return slots.filter((sl) => {
    const t = Date.parse(sl.starts_at);
    return t >= now.getTime() && t <= until && sl.seats_taken > 0 && (sl.facility_status ?? 'not_booked') !== 'reserved';
  }).length;
}

/** The next lesson to show in "Next up": in progress, else the soonest booked one. */
export function nextLesson<T extends TodayItem>(items: T[], now = new Date()): T | null {
  const booked = items
    .filter((i) => i.status === 'booked' && i.attendees.some(live) && Date.parse(i.ends_at) > now.getTime())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return booked[0] ?? null;
}

/** Local YYYY-MM-DD for grouping by day/month. */
export const localYmd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
