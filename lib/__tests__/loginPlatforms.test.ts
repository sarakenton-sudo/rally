import { platformFor, ownerKind, allowedOwners, defaultOwner, PLATFORMS } from '@/lib/loginPlatforms';

const one = [{ id: 'drue' }];
const two = [{ id: 'drue' }, { id: 'miles' }];

describe('platformFor', () => {
  it('matches saved labels and pasted names', () => {
    expect(platformFor('LeagueApps')).toBe('leagueapps');
    expect(platformFor('Drue - USAV member')).toBe('usav');
    expect(platformFor('SportsYou team chat')).toBe('sportsyou');
    expect(platformFor('Hudl highlights')).toBe('hudl');
    expect(platformFor('Club website')).toBe('other');
  });
});

describe('ownerKind (confirmed sorting)', () => {
  it.each(['groupme', 'sportsyou', 'leagueapps', 'aes', 'teamsnap'] as const)('%s is a family login', (k) => {
    expect(ownerKind(k)).toBe('family');
  });
  it.each(['sportsrecruits', 'ua', 'usav', 'hudl', 'ncsa'] as const)('%s belongs to one athlete', (k) => {
    expect(ownerKind(k)).toBe('athlete');
  });
  it('team code and other', () => {
    expect(ownerKind('team_code')).toBe('team');
    expect(ownerKind('other')).toBe('either');
  });
  it('every platform has a kind', () => {
    for (const p of PLATFORMS) expect(['family', 'athlete', 'team', 'either']).toContain(p.owner);
  });
});

describe('allowedOwners', () => {
  it('athlete-only platforms never offer Family', () => {
    expect(allowedOwners('sportsrecruits', two)).toEqual(['drue', 'miles']);
  });
  it('family platforms offer Family and each athlete', () => {
    expect(allowedOwners('groupme', two)).toEqual(['family', 'drue', 'miles']);
  });
  it('team code has no owner chips', () => {
    expect(allowedOwners('team_code', two)).toEqual([]);
  });
});

describe('defaultOwner', () => {
  it('family platforms preselect Family, even from an athlete page', () => {
    expect(defaultOwner({ platformKey: 'leagueapps', athletes: two, athleteIdParam: 'miles' })).toBe('family');
  });
  it('athlete platforms preselect the only athlete', () => {
    expect(defaultOwner({ platformKey: 'usav', athletes: one })).toBe('drue');
  });
  it('athlete platforms use the athlete page they were opened from', () => {
    expect(defaultOwner({ platformKey: 'hudl', athletes: two, athleteIdParam: 'miles' })).toBe('miles');
  });
  it('athlete platforms with several athletes make the parent pick', () => {
    expect(defaultOwner({ platformKey: 'ncsa', athletes: two })).toBeNull();
  });
  it('keeps an allowed choice the parent already made', () => {
    expect(defaultOwner({ platformKey: 'groupme', athletes: two, current: 'drue' })).toBe('drue');
    expect(defaultOwner({ platformKey: 'sportsrecruits', athletes: two, current: 'miles' })).toBe('miles');
  });
  it('drops Family when switching to an athlete-only platform', () => {
    expect(defaultOwner({ platformKey: 'sportsrecruits', athletes: two, current: 'family' })).toBeNull();
    expect(defaultOwner({ platformKey: 'sportsrecruits', athletes: one, current: 'family' })).toBe('drue');
  });
  it('Other defaults to Family, or the athlete page', () => {
    expect(defaultOwner({ platformKey: 'other', athletes: two })).toBe('family');
    expect(defaultOwner({ platformKey: 'other', athletes: two, athleteIdParam: 'drue' })).toBe('drue');
  });
  it('ignores an unknown athlete id', () => {
    expect(defaultOwner({ platformKey: 'hudl', athletes: two, athleteIdParam: 'ghost' })).toBeNull();
  });
  it('team code has no owner', () => {
    expect(defaultOwner({ platformKey: 'team_code', athletes: two })).toBeNull();
  });
});
