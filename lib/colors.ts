import { useColorScheme } from '@/components/useColorScheme';

/**
 * Theme-aware icon colors for use with Ionicons and other color props.
 * Call at the top of components that need dynamic icon colors.
 */
export function useIconColors() {
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';

  return {
    // Header / navigation icons
    muted: dark ? '#D8E2EC' : '#6B8BA8',           // frost / stronger mist
    // Secondary / decorative icons
    subtle: dark ? '#8FA8BF' : '#4A6E8A',           // mist / darker for light
    // Placeholder / empty state
    placeholder: dark ? '#152F43' : '#D8E2EC',      // rally-900 / frost
    // Accent colors
    rally: '#3B82B0',
    red: '#dc2626',
    green: '#6A9E8A',
    amber: '#6A9E8A',
    purple: '#7c3aed',
    white: '#FEFEFE',
  };
}

/**
 * App-wide color meaning — keep these distinct:
 *  - TOURNAMENT_COLOR (sage): tournaments, everywhere. Nothing else uses it.
 *  - STATUS colors: green = done/confirmed, amber = needs attention/requested,
 *    red = urgent. Never used to mean a *type* of thing.
 *  - Lesson kinds: SESSION_KIND_STYLE in lib/coach.ts (blue/purple/cyan/magenta/indigo).
 */
export const TOURNAMENT_COLOR = '#6A9E8A';
