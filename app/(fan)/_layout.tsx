import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

/**
 * Fan app (00086): grandparents, family and friends a parent invited from
 * Fans. Read-only — the season's tournaments, locations, streams, tickets.
 */
export default function FanTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FEFEFE',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
        tabBarStyle: { backgroundColor: '#1E3A5F', borderTopColor: 'rgba(255,255,255,0.07)' },
      }}
    >
      <Tabs.Screen name="fan-home" options={{ title: 'Season', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }} />
      <Tabs.Screen name="fan-settings" options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} /> }} />
    </Tabs>
  );
}
