import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import CoachQuickAddSheet from '@/components/coach/CoachQuickAddSheet';
import { CORAL } from '@/lib/colors';

/**
 * Coach app: Today · Schedule · (+) · Clients · Business.
 * Account type 'coach' lands here; parents who also coach reach it from
 * Hub → Coach Mode and switch back with "Family" on Today.
 */
export default function CoachTabsLayout() {
  const [addOpen, setAddOpen] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#FEFEFE',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
          tabBarStyle: { backgroundColor: '#1E3A5F', borderTopColor: 'rgba(255,255,255,0.07)' },
        }}
      >
        <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: ({ color, size }) => <Ionicons name="sunny" size={size} color={color} /> }} />
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
