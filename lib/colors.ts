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
    subtle: dark ? '#8FA8BF' : '#8FA8BF',           // mist both
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
