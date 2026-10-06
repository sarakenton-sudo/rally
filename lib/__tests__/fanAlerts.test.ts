import { shortRange, gameDayDue, gameDayText, streamDue, newTournamentsText, dayNumber } from '../../supabase/functions/_shared/fanAlerts';

const t = { start_date: '2026-10-17', end_date: '2026-10-18', fan_gameday_sent_on: null as string | null, fan_stream_sent_url: null as string | null };

describe('fan alerts', () => {
  it('formats date ranges', () => {
    expect(shortRange('2026-10-17', '2026-10-18')).toBe('Oct 17–18');
    expect(shortRange('2026-10-31', '2026-11-01')).toBe('Oct 31–Nov 1');
    expect(shortRange('2026-10-17', '2026-10-17')).toBe('Oct 17');
  });
  it('sends game day once per tournament day, from 7am', () => {
    expect(gameDayDue('2026-10-17', 6, t)).toBe(false);
    expect(gameDayDue('2026-10-17', 7, t)).toBe(true);
    expect(gameDayDue('2026-10-18', 9, { ...t, fan_gameday_sent_on: '2026-10-17' })).toBe(true);
    expect(gameDayDue('2026-10-17', 9, { ...t, fan_gameday_sent_on: '2026-10-17' })).toBe(false);
    expect(gameDayDue('2026-10-19', 9, t)).toBe(false);
    expect(gameDayDue('2026-10-16', 9, t)).toBe(false);
  });
  it('writes game day text', () => {
    expect(gameDayText({ athlete: 'Drue', name: 'Lone Star Classic', dayNum: 1, days: 2, venue: 'KBH Convention Center', stream: 'BallerTV' }))
      .toEqual({ title: 'Drue plays today!', body: 'Lone Star Classic · KBH Convention Center · Watch on BallerTV' });
    expect(gameDayText({ athlete: 'Drue', name: 'Lone Star Classic', dayNum: 2, days: 2 }).title).toBe('Lone Star Classic · Day 2');
    expect(dayNumber('2026-10-17', '2026-10-18')).toBe(2);
  });
  it('announces a stream only after game day push and only once per link', () => {
    const sent = { ...t, fan_gameday_sent_on: '2026-10-17' };
    expect(streamDue('2026-10-17', t, 'https://x')).toBe(false);
    expect(streamDue('2026-10-17', sent, 'https://x')).toBe(true);
    expect(streamDue('2026-10-17', { ...sent, fan_stream_sent_url: 'https://x' }, 'https://x')).toBe(false);
    expect(streamDue('2026-10-17', sent, null)).toBe(false);
  });
  it('groups new tournaments into one push', () => {
    expect(newTournamentsText('Miles', [{ name: 'Fall Kickoff', start_date: '2026-11-07', end_date: '2026-11-08' }]).body).toBe('Fall Kickoff, Nov 7–8');
    const many = newTournamentsText('Drue', [
      { name: 'B', start_date: '2026-12-01', end_date: '2026-12-02' },
      { name: 'A', start_date: '2026-11-07', end_date: '2026-11-08' },
    ]);
    expect(many).toEqual({ title: '2 new tournaments for Drue', body: 'Starting with A, Nov 7–8' });
  });
});
