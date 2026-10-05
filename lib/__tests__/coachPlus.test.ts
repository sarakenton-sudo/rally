import { getCoachPlusOrder, type CoachPlusContext } from '../coachPlus';

const NOW = new Date(2026, 9, 7, 19, 30); // Wed Oct 7, 7:30pm
const base = (o: Partial<CoachPlusContext> = {}): CoachPlusContext => ({
  now: NOW, pendingRequests: 0, openSlotsNext7Days: 5, unpaidEndedLessons: [], ...o,
});

describe('coach + sheet ordering', () => {
  it('default order: open time, record payment, share link, invite family', () => {
    const o = getCoachPlusOrder(base());
    expect(o.topItems).toEqual(['open_time', 'record_payment', 'share_link', 'invite_family']);
    expect(o.rule).toBe('default');
  });

  it('invite a family is in the top tier', () => {
    expect(getCoachPlusOrder(base()).topItems).toContain('invite_family');
  });

  it('a lesson that ended today unpaid puts Record a payment first', () => {
    const o = getCoachPlusOrder(base({ unpaidEndedLessons: [{ endsAt: new Date(2026, 9, 7, 18, 0).toISOString() }] }));
    expect(o.topItems[0]).toBe('record_payment');
    expect(o.rule).toBe('unpaid_today');
  });

  it('unpaid lessons from earlier days do not reorder', () => {
    const o = getCoachPlusOrder(base({ unpaidEndedLessons: [{ endsAt: new Date(2026, 9, 5, 18, 0).toISOString() }] }));
    expect(o.rule).toBe('default');
  });

  it('nothing open in the next 7 days puts Add open time first', () => {
    const o = getCoachPlusOrder(base({ openSlotsNext7Days: 0 }));
    expect(o.topItems[0]).toBe('open_time');
    expect(o.rule).toBe('no_open_time');
  });

  it('unpaid-today beats no-open-time', () => {
    const o = getCoachPlusOrder(base({ openSlotsNext7Days: 0, unpaidEndedLessons: [{ endsAt: new Date(2026, 9, 7, 17, 0).toISOString() }] }));
    expect(o.topItems[0]).toBe('record_payment');
  });

  it('pending requests show a review prompt without reordering', () => {
    const o = getCoachPlusOrder(base({ pendingRequests: 2 }));
    expect(o.reviewPrompt).toBe(2);
    expect(o.rule).toBe('default');
  });
});
