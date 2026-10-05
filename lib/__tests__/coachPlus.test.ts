import { getCoachPlusOrder, type CoachPlusContext } from '../coachPlus';

const NOW = new Date(2026, 9, 7, 19, 30); // Wed Oct 7, 7:30pm
const base = (o: Partial<CoachPlusContext> = {}): CoachPlusContext => ({
  now: NOW, pendingRequests: 0, openSlotsNext7Days: 5, unpaidEndedLessons: [], ...o,
});

describe('coach + sheet ordering', () => {
  it('default order: add a client, invite a client, open time, book a lesson, record payment, share link', () => {
    const o = getCoachPlusOrder(base());
    expect(o.topItems).toEqual(['add_client', 'invite_family', 'open_time', 'book_family', 'record_payment', 'share_link']);
    expect(o.rule).toBe('default');
  });

  it('add a client and invite a client lead the list', () => {
    expect(getCoachPlusOrder(base()).topItems.slice(0, 2)).toEqual(['add_client', 'invite_family']);
  });

  it('context rules keep add/invite right after the promoted item', () => {
    const o = getCoachPlusOrder(base({ openSlotsNext7Days: 0 }));
    expect(o.topItems.slice(0, 3)).toEqual(['open_time', 'add_client', 'invite_family']);
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
