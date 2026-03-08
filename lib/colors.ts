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
    muted: dark ? '#d1d5db' : '#6b7280',         // gray-300 / gray-500
    // Secondary / decorative icons
    subtle: dark ? '#9ca3af' : '#9ca3af',         // gray-400 both
    // Placeholder / empty state
    placeholder: dark ? '#4b5563' : '#d1d5db',    // gray-600 / gray-300
    // Accent colors (stay the same)
    rally: '#2563eb',
    red: '#dc2626',
    green: '#16a34a',
    amber: '#d97706',
    purple: '#7c3aed',
    white: '#ffffff',
  };
}
