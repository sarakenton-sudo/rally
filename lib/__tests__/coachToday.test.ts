import { moneyStrip, gymsToBook, nextLesson, localYmd, type TodayItem, type TodaySlot } from '@/lib/coachToday';

const NOW = new Date(2026, 9, 7, 12, 0); // Wed Oct 7, noon
const iso = (d: number, h: number) => new Date(2026, 9, d, h, 0).toISOString();
const item = (d: number, h: number, attendees: TodayItem['attendees'], status: TodayItem['status'] = 'booked'): TodayItem => ({
  slot_id: `s${d}${h}`, starts_at: iso(d, h), ends_at: iso(d, h + 1), status, attendees,
});
const bk = (o: Partial<TodayItem['attendees'][0]> = {}) => ({ kind: 'booking' as const, status: 'confirmed', price_cents: 8000, payment_status: 'pending', ...o });

describe('moneyStrip', () => {
  it('booked / collected / unpaid, cancelled excluded, unpaid only once a lesson happened', () => {
    const items = [
      item(5, 16, [bk({ payment_status: 'captured' })]),           // past, paid
      item(6, 16, [bk()]),                                         // past, unpaid
      item(9, 16, [bk()]),                                         // future, not yet owed
      item(8, 16, [bk({ status: 'cancelled' })]),                  // cancelled
      item(6, 18, [bk({ payment_status: 'refunded' })]),           // refunded — not owed
    ];
    const s = moneyStrip(items, [], NOW);
    expect(s.lessons).toBe(4);
    expect(s.booked).toBe(32000);
    expect(s.collected).toBe(8000);
    expect(s.unpaid).toBe(8000);
  });
  it('a group lesson counts each athlete', () => {
    const s = moneyStrip([item(9, 16, [bk({ price_cents: 3000 }), bk({ price_cents: 3000 })])], [], NOW);
    expect(s.lessons).toBe(2);
    expect(s.booked).toBe(6000);
  });
  it('requests are not money yet', () => {
    expect(moneyStrip([item(9, 16, [{ kind: 'request', status: 'requested', price_cents: 8000 }], 'pending')], [], NOW).booked).toBe(0);
  });
  it('open capacity is a count of spots, not dollars', () => {
    const slots: TodaySlot[] = [
      { id: 'a', starts_at: iso(9, 16), status: 'open', seats_total: 4, seats_taken: 1 },
      { id: 'b', starts_at: iso(6, 16), status: 'open', seats_total: 1, seats_taken: 0 },   // already passed
      { id: 'c', starts_at: iso(10, 16), status: 'blocked', seats_total: 1, seats_taken: 0 },
    ];
    expect(moneyStrip([], slots, NOW).openSpots).toBe(3);
  });
});

describe('gymsToBook', () => {
  const slot = (d: number, taken: number, fs?: string): TodaySlot => ({ id: `${d}${fs}`, starts_at: iso(d, 16), status: 'booked', seats_total: 1, seats_taken: taken, facility_status: fs });
  it('booked lessons in the next 7 days without a reserved gym', () => {
    expect(gymsToBook([slot(8, 1), slot(9, 1, 'requested'), slot(10, 1, 'reserved'), slot(11, 0), slot(20, 1), slot(6, 1)], NOW)).toBe(2);
  });
});

describe('nextLesson', () => {
  it('in-progress beats later; skips requests and cancelled', () => {
    const live = item(7, 11, [bk()]);                       // 11–12... ends at noon exactly → over
    const soon = item(7, 15, [bk()]);
    const req = item(7, 13, [{ kind: 'request', status: 'requested' }], 'pending');
    const cancelled = item(7, 14, [bk({ status: 'cancelled' })]);
    expect(nextLesson([soon, req, cancelled, live], NOW)?.slot_id).toBe(soon.slot_id);
    const now2 = new Date(2026, 9, 7, 15, 30);
    expect(nextLesson([soon], now2)?.slot_id).toBe(soon.slot_id); // still in progress
  });
});

it('localYmd', () => expect(localYmd(new Date(2026, 9, 7, 23, 30).toISOString())).toBe('2026-10-07'));
