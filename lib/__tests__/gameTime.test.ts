import { toLabel, fromLabel, GAME_TIMES } from '@/lib/gameTime';

describe('game times', () => {
  it('round-trips between stored and shown times', () => {
    expect(toLabel('18:30:00')).toBe('6:30 PM');
    expect(toLabel('00:15')).toBe('12:15 AM');
    expect(toLabel('12:00')).toBe('12:00 PM');
    expect(fromLabel('6:30 PM')).toBe('18:30');
    expect(fromLabel('12:00 AM')).toBe('00:00');
    expect(fromLabel('12:45 PM')).toBe('12:45');
    expect(fromLabel('No time')).toBeNull();
  });
  it('offers 15-minute choices through the evening', () => {
    expect(GAME_TIMES[0]).toBe('6:00 AM');
    expect(GAME_TIMES).toContain('6:30 PM');
    expect(GAME_TIMES[GAME_TIMES.length - 1]).toBe('10:45 PM');
  });
});

import { timeWithZone, zoneFromLabel, zoneLabel } from '@/lib/gameTime';
describe('game time zones', () => {
  it('shows the zone after the time when set', () => {
    expect(timeWithZone('18:30:00', 'America/Chicago')).toBe('6:30 PM CT');
    expect(timeWithZone('18:30:00', null)).toBe('6:30 PM');
    expect(timeWithZone(null, 'America/Chicago')).toBe('');
  });
  it('maps labels and zones both ways', () => {
    expect(zoneFromLabel('Pacific (PT)')).toBe('America/Los_Angeles');
    expect(zoneLabel('America/New_York')).toBe('Eastern (ET)');
  });
});

import { zoneFromPlace } from '@/lib/gameTime';
describe('time zone from a place', () => {
  it('reads the state from an address or city', () => {
    expect(zoneFromPlace('650 S Griffin St, Dallas, TX 75202, USA')).toBe('America/Chicago');
    expect(zoneFromPlace('Orlando, FL')).toBe('America/New_York');
    expect(zoneFromPlace('1401 Toro Grande Blvd, Cedar Park, TX 78613')).toBe('America/Chicago');
    expect(zoneFromPlace('Las Vegas, NV 89109')).toBe('America/Los_Angeles');
    expect(zoneFromPlace('Phoenix, AZ')).toBe('America/Phoenix');
    expect(zoneFromPlace('Main Gym')).toBeNull();
  });
});
