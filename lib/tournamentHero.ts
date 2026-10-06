import type { ImageSourcePropType } from 'react-native';

// Impressionist volleyball paintings (Midjourney) for tournament page headers
// (assets/tournament-heroes). Each tournament keeps the same one.
const HEROES: ImageSourcePropType[] = [
  require('../assets/tournament-heroes/hero-01.jpg'),
  require('../assets/tournament-heroes/hero-02.jpg'),
  require('../assets/tournament-heroes/hero-03.jpg'),
  require('../assets/tournament-heroes/hero-04.jpg'),
  require('../assets/tournament-heroes/hero-05.jpg'),
  require('../assets/tournament-heroes/hero-06.jpg'),
  require('../assets/tournament-heroes/hero-07.jpg'),
  require('../assets/tournament-heroes/hero-08.jpg'),
  require('../assets/tournament-heroes/hero-09.jpg'),
  require('../assets/tournament-heroes/hero-10.jpg'),
];

/**
 * Rotate through the paintings in schedule order, so back-to-back
 * tournaments never share one. Falls back to a hash of the id.
 */
export function tournamentHero(id: string, schedule?: { id: string; start_date: string }[]): ImageSourcePropType {
  const ordered = schedule ? [...schedule].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id)) : [];
  let i = ordered.findIndex((t) => t.id === id);
  if (i < 0) { let h = 2166136261; for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 16777619) >>> 0; i = h; }
  return HEROES[i % HEROES.length];
}
