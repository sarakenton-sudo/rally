import { gameTitle, formatGameTime } from '@/lib/teamEvents';

describe('game cards', () => {
  it('titles games by opponent and home/away', () => {
    expect(gameTitle({ name: 'Game', opponent: 'Rouse', home_away: 'home', event_type: 'game' })).toBe('vs Rouse');
    expect(gameTitle({ name: 'Game', opponent: 'Bowie', home_away: 'away', event_type: 'game' })).toBe('@ Bowie');
    expect(gameTitle({ name: 'Team dinner', opponent: null, home_away: null, event_type: 'event' })).toBe('Team dinner');
  });
  it('formats times', () => {
    expect(formatGameTime('17:30:00')).toBe('5:30 PM');
    expect(formatGameTime('11:00')).toBe('11:00 AM');
    expect(formatGameTime('00:15')).toBe('12:15 AM');
    expect(formatGameTime(null)).toBeNull();
  });
});
