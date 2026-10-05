import { earningsTotals, earningsCsv, type EarningsRow } from '@/lib/payments';

const row = (o: Partial<EarningsRow>): EarningsRow => ({
  id: Math.random().toString(36), status: 'confirmed', payment_status: 'unpaid', price_cents: 8000,
  paid_amount_cents: null, amount_charged_cents: null, platform_fee_cents: null, refunded_cents: null,
  payment_method: null, paid_at: null, slots: { starts_at: '2026-10-06T23:00:00Z' }, athletes: { first_name: 'Drue', last_name: 'K' },
  ...o,
} as unknown as EarningsRow);

describe('earningsTotals (Business → Payments & earnings, C-27)', () => {
  it('splits collected, outstanding, cash and fees', () => {
    const t = earningsTotals([
      row({ payment_status: 'captured', payment_method: 'card', platform_fee_cents: 330, amount_charged_cents: 8330 }),
      row({ payment_status: 'captured', payment_method: 'venmo' as any }),
      row({}),
    ]);
    expect(t.lessons).toBe(3);
    expect(t.booked).toBe(24000);
    expect(t.collected).toBe(8330 + 8000);
    expect(t.cash).toBe(8000);
    expect(t.fees).toBe(330);
    expect(t.outstanding).toBe(8000);
  });
  it('ignores cancelled unpaid lessons and counts refunds', () => {
    const t = earningsTotals([
      row({ status: 'cancelled' }),
      row({ status: 'cancelled', payment_status: 'captured', payment_method: 'card', refunded_cents: 8000 }),
    ]);
    expect(t.lessons).toBe(0);
    expect(t.outstanding).toBe(0);
    expect(t.refunded).toBe(8000);
  });
});

describe('earningsCsv', () => {
  it('has a header and one quoted row per lesson', () => {
    const csv = earningsCsv([row({ payment_status: 'captured', payment_method: 'cash' as any, paid_at: '2026-10-07T01:00:00Z' })]);
    const [head, line] = csv.split('\n');
    expect(head).toContain('"Lesson date"');
    expect(line).toBe('"2026-10-06","Drue K","confirmed/captured","80.00","80.00","cash","0.00","0.00","2026-10-07"');
  });
  it('escapes quotes in names', () => {
    expect(earningsCsv([row({ athletes: { first_name: 'A "J"', last_name: null } as any })])).toContain('"A ""J"""');
  });
});
