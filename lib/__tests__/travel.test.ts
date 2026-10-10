import { isOneWayOnly } from '@/lib/travel';

describe('one-way flights', () => {
  it('a single flight without a return is one-way only', () => {
    expect(isOneWayOnly([{ return_date: null } as any])).toBe(true);
  });
  it('round trip, or out-and-back as two bookings, is booked', () => {
    expect(isOneWayOnly([{ return_date: '2026-11-22' } as any])).toBe(false);
    expect(isOneWayOnly([{ return_date: null } as any, { return_date: null } as any])).toBe(false);
    expect(isOneWayOnly([])).toBe(false);
  });
});
