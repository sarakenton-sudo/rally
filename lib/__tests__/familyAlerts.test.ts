import { nightBeforeDue, weekAheadDue, nightBeforeText, weekAheadText, type FamilyItem } from '../../supabase/functions/_shared/familyAlerts';

const items: FamilyItem[] = [
  { kind: 'game', athlete: 'Miles', title: '@ Westlake', day: '2026-10-15', time: '6:30 PM CT' },
  { kind: 'tournament', athlete: 'Drue', title: 'Lone Star Classic', day: '2026-10-17' },
  { kind: 'lesson', athlete: 'Drue', title: 'Private Lesson with Ben', day: '2026-10-19', time: '4:00 PM' },
];

describe('family reminders', () => {
  it('sends at the right local times', () => {
    expect(nightBeforeDue(19)).toBe(true);
    expect(nightBeforeDue(18)).toBe(false);
    expect(weekAheadDue(0, 18)).toBe(true);
    expect(weekAheadDue(1, 18)).toBe(false);
  });
  it('names the kids', () => {
    expect(nightBeforeText([items[0], items[1]])).toEqual({ title: 'Tomorrow', body: 'Drue: Lone Star Classic · Miles: @ Westlake 6:30 PM CT' });
    const w = weekAheadText(items);
    expect(w.title).toBe('Your week: 1 tournament, 1 game, 1 lesson');
    expect(w.body).toBe('Miles: @ Westlake Thu 6:30 PM CT · Drue: Lone Star Classic Sat · Drue: Private Lesson with Ben Mon 4:00 PM');
  });
});
