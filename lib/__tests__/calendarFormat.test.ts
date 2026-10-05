import {
  compactYmdPlus, compactUtc, googleTemplateUrl, buildIcs, eventUid, webcalUrl,
  findGoogleCalendar, findRallyCalendar, pickSourceForNewCalendar, withoutDuplicates, targetsFor,
  type DeviceCalendar, type CalEvent,
} from '@/lib/calendarFormat';

const tourney: CalEvent = { allDay: true, title: 'Northern Lights, 14U', startDate: '2026-12-31', endDate: '2027-01-02', location: 'Minneapolis; MN' };
const lesson: CalEvent = { allDay: false, title: 'Private lesson', start: '2026-10-06T21:00:00Z', end: '2026-10-06T22:00:00Z', location: 'Westide' };

describe('date formatting', () => {
  it('rolls over months and years', () => {
    expect(compactYmdPlus('2026-12-31', 1)).toBe('20270101');
    expect(compactYmdPlus('2028-02-28', 1)).toBe('20280229');
  });
  it('formats UTC times', () => expect(compactUtc('2026-10-06T21:05:09Z')).toBe('20261006T210509Z'));
});

describe('Google template link', () => {
  it('all-day end is exclusive', () => {
    const u = googleTemplateUrl(tourney);
    expect(u.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE')).toBe(true);
    expect(u).toContain(`dates=${encodeURIComponent('20261231/20270103')}`);
    expect(u).toContain(`text=${encodeURIComponent('Northern Lights, 14U')}`);
  });
  it('timed events use UTC', () => {
    expect(googleTemplateUrl(lesson)).toContain(`dates=${encodeURIComponent('20261006T210000Z/20261006T220000Z')}`);
  });
});

describe('.ics', () => {
  const ics = buildIcs([tourney, lesson], new Date('2026-10-04T00:00:00Z'));
  it('is a valid calendar with CRLF lines', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
  it('all-day and timed events', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270103');
    expect(ics).toContain('DTSTART:20261006T210000Z\r\nDTEND:20261006T220000Z');
  });
  it('escapes commas and semicolons', () => {
    expect(ics).toContain('SUMMARY:Northern Lights\\, 14U');
    expect(ics).toContain('LOCATION:Minneapolis\\; MN');
  });
  it('stable UIDs so re-imports update instead of duplicating', () => {
    expect(eventUid(tourney)).toBe(eventUid({ ...tourney }));
    expect(eventUid(tourney)).not.toBe(eventUid(lesson));
  });
});

const cal = (title: string, sourceName: string, sourceType: string, allowsModifications = true): DeviceCalendar =>
  ({ id: title, title, allowsModifications, source: { id: sourceName, name: sourceName, type: sourceType } });

describe('which device calendar', () => {
  const school = cal("Drue's School", 'iCloud', 'caldav');           // shared, writable — must not be used
  const subscribed = cal('US Holidays', 'Subscribed Calendars', 'subscribed', false);
  const gPrimary = cal('sara@gmail.com', 'sara@gmail.com', 'caldav');
  const gOther = cal('Volleyball', 'sara@gmail.com', 'caldav');

  it('never picks a shared or subscribed calendar as ours', () => {
    expect(findRallyCalendar([school, subscribed])).toBeNull();
    expect(findRallyCalendar([school, cal('RallyHUB', 'iCloud', 'caldav')])?.title).toBe('RallyHUB');
  });
  it("finds the Google account's primary calendar", () => {
    expect(findGoogleCalendar([school, gOther, gPrimary])?.title).toBe('sara@gmail.com');
    expect(findGoogleCalendar([school, subscribed])).toBeNull();
  });
  it('creates RallyHUB in iCloud, else On My iPhone, never subscribed', () => {
    const icloud = { id: '1', name: 'iCloud', type: 'caldav' };
    const local = { id: '2', name: 'Default', type: 'local' };
    const sub = { id: '3', name: 'Subscribed Calendars', type: 'subscribed' };
    expect(pickSourceForNewCalendar([sub, local, icloud], null)?.id).toBe('1');
    expect(pickSourceForNewCalendar([sub, local], null)?.id).toBe('2');
    expect(pickSourceForNewCalendar([sub], null)).toBeNull();
  });
  it('skips events already in the calendar', () => {
    const existing = [{ title: 'Northern Lights, 14U', startDate: new Date(2026, 11, 31) }];
    expect(withoutDuplicates([tourney, lesson], existing)).toEqual([lesson]);
  });
});

it('webcal and per-platform choices', () => {
  expect(webcalUrl('https://x.supabase.co/functions/v1/coach-calendar-feed?token=a')).toBe('webcal://x.supabase.co/functions/v1/coach-calendar-feed?token=a');
  expect(targetsFor('web')).toEqual(['google', 'apple', 'ics']);
  expect(targetsFor('ios')).toEqual(['google', 'apple']);
});
