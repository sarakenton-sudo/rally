import { parseFanCode, fanInviteUrl, fanInviteMessage, groupByMonth } from '@/lib/fan';

describe('fan invites', () => {
  it('accepts a bare code, lowercase, spaces or the full link', () => {
    expect(parseFanCode('ab23 cd45')).toBe('AB23CD45');
    expect(parseFanCode('https://rally-hub.com/fan/AB23CD45')).toBe('AB23CD45');
    expect(parseFanCode('rally-hub.com/fan/ab23cd45?x=1')).toBe('AB23CD45');
  });
  it('links to the fan page and names the athlete', () => {
    expect(fanInviteUrl('AB23CD45')).toBe('https://rally-hub.com/fan/AB23CD45');
    const m = fanInviteMessage('Grandma', 'Drue', 'AB23CD45');
    expect(m.startsWith('Hi Grandma!')).toBe(true);
    expect(m).toContain("Drue's volleyball season");
    expect(m.endsWith('https://rally-hub.com/fan/AB23CD45')).toBe(true);
  });
});

describe('groupByMonth', () => {
  it('groups in date order under month labels', () => {
    const g = groupByMonth([{ start_date: '2026-12-05' }, { start_date: '2026-11-19' }, { start_date: '2026-11-13' }]);
    expect(g.map((x) => x.month)).toEqual(['November 2026', 'December 2026']);
    expect(g[0].items.map((x) => x.start_date)).toEqual(['2026-11-13', '2026-11-19']);
  });
});
