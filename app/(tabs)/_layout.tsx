import React, { useState } from 'react';
import { View, Image, Pressable, Platform, Linking } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SeasonSwitcher from '@/components/SeasonSwitcher';
import QuickAddSheet from '@/components/QuickAddSheet';

const logoWhite = require('@/assets/images/rallyhub_lockup_white.png');

function GlobalHeader() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: 'rgba(30,58,95,0.97)',
      }}
    >
      {/* Logo row */}
      <View className="items-center px-5 pt-2 pb-2">
        {/* Account button (left) */}
        <Pressable
          className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70 absolute left-4"
          style={{
            top: 6 + insets.top,
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}
          onPress={() => router.push('/notifications')}
        >
          <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.65)" />
        </Pressable>

        <Pressable
          onPress={() => {
            if (Platform.OS === 'web') {
              window.location.href = '/homepage.html';
            }
          }}
          style={{ cursor: Platform.OS === 'web' ? 'pointer' : 'default' } as any}
        >
          <Image
            source={logoWhite}
            style={{ width: 220, height: 56 }}
            resizeMode="contain"
          />
        </Pressable>

        {/* Settings & account (right) */}
        <Pressable
          className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70 absolute right-4"
          style={{
            top: 6 + insets.top,
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}
          onPress={() => router.push('/hub')}
          accessibilityLabel="Settings"
        >
          <Ionicons name="person-circle-outline" size={22} color="rgba(255,255,255,0.65)" />
        </Pressable>
      </View>

      {/* Season switcher — hidden on Home (has inline filter) and Athlete tab (has its own) */}
      {(pathname === '/season' || pathname === '/travel') && <SeasonSwitcher />}

      {/* Bottom border */}
      <View className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
    </View>
  );
}

const hidden = { href: null } as const;

/**
 * Parent app: Home · Schedule · (+) · Travel · Family — same shape as the
 * coach app. Settings opens from the header; Athletes, Guests and Settings
 * stay as routes (no tab).
 */
export default function TabLayout() {
  const [addOpen, setAddOpen] = useState(false);
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} size={size} color={color} />;
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#FEFEFE',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
          tabBarStyle: { backgroundColor: '#1E3A5F', borderTopColor: 'rgba(255,255,255,0.07)' },
          header: () => <GlobalHeader />,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
        <Tabs.Screen name="season" options={{ title: 'Schedule', tabBarIcon: icon('calendar') }} />
        <Tabs.Screen
          name="add"
          options={{
            title: '',
            tabBarAccessibilityLabel: 'Add',
            // Not a real screen: the center button opens the + sheet.
            tabBarButton: () => (
              <Pressable onPress={() => setAddOpen(true)} accessibilityRole="button" accessibilityLabel="Add" testID="plus-button" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#3B82B0', alignItems: 'center', justifyContent: 'center', marginTop: -14, borderWidth: 3, borderColor: '#1E3A5F', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, elevation: 6 }}>
                  <Ionicons name="add" size={30} color="#FEFEFE" />
                </View>
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen name="travel" options={{ title: 'Travel', tabBarIcon: icon('airplane') }} />
        <Tabs.Screen name="family" options={{ title: 'Family', tabBarIcon: icon('people') }} />
        <Tabs.Screen name="athlete" options={{ title: 'Athletes', ...hidden }} />
        <Tabs.Screen name="guests" options={{ title: 'Guests', ...hidden }} />
        <Tabs.Screen name="hub" options={{ title: 'Settings', ...hidden }} />
      </Tabs>
      <QuickAddSheet visible={addOpen} onClose={() => setAddOpen(false)} />
    </View>
  );
}
