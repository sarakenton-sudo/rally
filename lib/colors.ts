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
    muted: dark ? '#EDE4D6' : '#9E8E7E',           // parchment / stone
    // Secondary / decorative icons
    subtle: dark ? '#9E8E7E' : '#9E8E7E',           // stone both
    // Placeholder / empty state
    placeholder: dark ? '#5E2F1E' : '#EDE4D6',      // rally-900 / parchment
    // Accent colors
    rally: '#C4714A',
    red: '#dc2626',
    green: '#7A8C6E',
    amber: '#B8924A',
    purple: '#7c3aed',
    white: '#FAF7F3',
  };
}
