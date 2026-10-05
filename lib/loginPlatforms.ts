// Platforms for "Save a login or code" and who each login belongs to.
// Pure data + helpers (no React Native) so the rules are unit-tested.
//
// Owner kinds:
//   family  — one parent login that covers every athlete (GroupMe, LeagueApps…)
//   athlete — 1:1 with one athlete; Family isn't offered (Sports Recruits, USAV…)
//   team    — a team code, saved on the team (season) instead
//   either  — "Other": the parent decides, Family by default
//
// Storage is unchanged: family = scope 'admin' + athlete_id null;
// athlete = scope 'athlete' + athlete_id.

export type PlatformKey =
  | 'groupme' | 'sportsyou' | 'leagueapps' | 'aes' | 'teamsnap'
  | 'sportsrecruits' | 'ua' | 'usav' | 'hudl' | 'ncsa'
  | 'team_code' | 'other';
export type OwnerKind = 'family' | 'athlete' | 'team' | 'either';
export type Fields = { url: boolean; username: string | null; password: boolean };
/** 'family' or an athlete id; null = not chosen yet. */
export type Owner = 'family' | string | null;

export interface LoginPlatform {
  key: PlatformKey;
  label: string;
  match: string[];
  url?: string;
  icon: string;
  fields: Fields;
  owner: OwnerKind;
}

const LOGIN: Fields = { url: true, username: 'Email or username', password: true };

export const PLATFORMS: LoginPlatform[] = [
  // Family: one parent account for all the kids
  { key: 'groupme', label: 'GroupMe', match: ['groupme'], url: 'https://web.groupme.com', icon: 'chatbubbles-outline', fields: { url: true, username: null, password: false }, owner: 'family' },
  { key: 'sportsyou', label: 'SportsYou', match: ['sportsyou', 'sports you'], url: 'https://sportsyou.com', icon: 'chatbubbles-outline', fields: LOGIN, owner: 'family' },
  { key: 'leagueapps', label: 'LeagueApps', match: ['leagueapps'], url: 'https://leagueapps.com', icon: 'trophy-outline', fields: LOGIN, owner: 'family' },
  { key: 'aes', label: 'AES / SportsEngine', match: ['aes', 'sportsengine', 'advanced event'], url: 'https://www.advancedeventsystems.com', icon: 'globe-outline', fields: LOGIN, owner: 'family' },
  { key: 'teamsnap', label: 'TeamSnap', match: ['teamsnap', 'team snap'], url: 'https://go.teamsnap.com', icon: 'people-outline', fields: LOGIN, owner: 'family' },
  // Athlete: belongs to one athlete only
  { key: 'sportsrecruits', label: 'Sports Recruits', match: ['sportsrecruits', 'sports recruits'], url: 'https://my.sportsrecruits.com/login', icon: 'school-outline', fields: LOGIN, owner: 'athlete' },
  { key: 'ua', label: 'University Athlete', match: ['university athlete', 'universityathlete'], url: 'https://universityathlete.com', icon: 'trophy-outline', fields: LOGIN, owner: 'athlete' },
  { key: 'usav', label: 'USA Volleyball', match: ['usa volleyball', 'usav'], icon: 'shield-checkmark', fields: { url: false, username: 'Member ID', password: false }, owner: 'athlete' },
  { key: 'hudl', label: 'Hudl', match: ['hudl'], url: 'https://www.hudl.com/login', icon: 'videocam-outline', fields: LOGIN, owner: 'athlete' },
  { key: 'ncsa', label: 'NCSA', match: ['ncsa'], url: 'https://www.ncsasports.org', icon: 'school-outline', fields: LOGIN, owner: 'athlete' },
  // Other
  { key: 'team_code', label: 'Team code', match: [], icon: 'key-outline', fields: { url: false, username: null, password: false }, owner: 'team' },
  { key: 'other', label: 'Other', match: [], icon: 'globe-outline', fields: LOGIN, owner: 'either' },
];

export const FAMILY_LABEL = 'Family (all athletes)';

export const platformSpec = (key: PlatformKey): LoginPlatform => PLATFORMS.find((p) => p.key === key)!;

/** Best platform for a saved label or pasted name ("LeagueApps login" → leagueapps). */
export function platformFor(label: string): PlatformKey {
  const lower = label.toLowerCase();
  return PLATFORMS.find((p) => p.match.some((m) => lower.includes(m)))?.key ?? 'other';
}

export const ownerKind = (key: PlatformKey): OwnerKind => platformSpec(key).owner;

/** Owners the parent may pick for this platform ('family' and/or athlete ids). */
export function allowedOwners(key: PlatformKey, athletes: { id: string }[]): Owner[] {
  const kind = ownerKind(key);
  if (kind === 'team') return [];
  const ids = athletes.map((a) => a.id);
  return kind === 'athlete' ? ids : ['family', ...ids];
}

/**
 * Who a login belongs to by default.
 * - current: an owner the parent already chose on this screen (kept if allowed)
 * - athleteIdParam: the athlete page the screen was opened from
 */
export function defaultOwner({ platformKey, athletes, athleteIdParam, current }: {
  platformKey: PlatformKey;
  athletes: { id: string }[];
  athleteIdParam?: string | null;
  current?: Owner;
}): Owner {
  const kind = ownerKind(platformKey);
  if (kind === 'team') return null;
  const allowed = allowedOwners(platformKey, athletes);
  if (current && allowed.includes(current)) return current;
  const fromPage = athleteIdParam && athletes.some((a) => a.id === athleteIdParam) ? athleteIdParam : null;
  if (kind === 'athlete') return fromPage ?? (athletes.length === 1 ? athletes[0].id : null);
  if (kind === 'family') return 'family';
  return fromPage ?? 'family'; // either
}
