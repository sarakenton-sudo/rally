import { TAB_BAR_STYLE, TAB_BAR_LABEL_STYLE } from '@/lib/tabBar';
import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useCoachStore } from '@/stores/useCoachStore';
import { fetchMyCoach, isSupabaseConfigured } from '@/lib/coach';
import { View, Pressable } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import CoachQuickAddSheet from '@/components/coach/CoachQuickAddSheet';
import { CORAL } from '@/lib/colors';

/**
 * Coach app: Home · Schedule · (+) · Clients · Business.
 * Account type 'coach' lands here; parents who also coach reach it from
 * Hub → Coach Mode and switch back with "Family" on Today.
 */
export default function CoachTabsLayout() {
  const [addOpen, setAddOpen] = useState(false);
  // Load the coach profile for every tab. Only Home and Business used to, so
  // opening Schedule or Clients first (a refresh or a link on the web) showed
  // an empty schedule.
  const { user } = useAuth();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const setCoachProfile = useCoachStore((s) => s.setCoachProfile);
  useEffect(() => {
    if (coachProfile || !user || !isSupabaseConfigured) return;
    fetchMyCoach(user.id).then(({ data }) => { if (data) setCoachProfile(data); });
  }, [user, coachProfile]);
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#FEFEFE',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
          tabBarStyle: TAB_BAR_STYLE,
          tabBarLabelStyle: TAB_BAR_LABEL_STYLE,
        }}
      >
        <Tabs.Screen name="today" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
        <Tabs.Screen name="coach-schedule" options={{ title: 'Schedule', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} /> }} />
        <Tabs.Screen
          name="add"
          options={{
            title: '',
            tabBarAccessibilityLabel: 'Add',
            // Not a real screen: the center button opens the coach + sheet.
            tabBarButton: () => (
              <Pressable onPress={() => setAddOpen(true)} accessibilityRole="button" accessibilityLabel="Add" testID="plus-button" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center', marginTop: -14, borderWidth: 3, borderColor: '#1E3A5F', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, elevation: 6 }}>
                  <Ionicons name="add" size={30} color="#FEFEFE" />
                </View>
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen name="coach-clients" options={{ title: 'Clients', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }} />
        <Tabs.Screen name="business" options={{ title: 'Business', tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" size={size} color={color} /> }} />
      </Tabs>
      <CoachQuickAddSheet visible={addOpen} onClose={() => setAddOpen(false)} />
    </View>
  );
}
