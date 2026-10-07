import { TAB_BAR_STYLE, TAB_BAR_LABEL_STYLE } from '@/lib/tabBar';
import React, { useState } from 'react';
import { View, Image, Pressable, Platform, Linking } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SeasonSwitcher from '@/components/SeasonSwitcher';
import QuickAddSheet from '@/components/QuickAddSheet';
import { CORAL } from '@/lib/colors';

const logoWhite = require('@/assets/images/rallyhub_lockup_white.png');

function HeaderButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70"
      style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Ionicons name={icon} size={21} color="#FEFEFE" />
    </Pressable>
  );
}

function GlobalHeader() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: '#1E3A5F' }}>
      {/* Bell · logo · settings in one row, so the buttons always sit inside the navy bar. */}
      <View className="flex-row items-center justify-between px-4 pt-1 pb-2">
        <HeaderButton icon="notifications-outline" label="Notifications" onPress={() => router.push('/notifications')} />
        <Pressable
          onPress={() => {
            if (Platform.OS === 'web') {
              window.location.href = '/homepage.html';
            }
          }}
          style={{ cursor: Platform.OS === 'web' ? 'pointer' : 'default' } as any}
          accessibilityLabel="RallyHUB"
        >
          <Image source={logoWhite} style={{ width: 200, height: 52 }} resizeMode="contain" />
        </Pressable>
        <HeaderButton icon="person-circle-outline" label="Settings" onPress={() => router.push('/hub')} />
      </View>

      {/* Season switcher on team-scoped tabs */}
      {(pathname === '/season' || pathname === '/travel') && <SeasonSwitcher />}

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
          tabBarStyle: TAB_BAR_STYLE,
          tabBarLabelStyle: TAB_BAR_LABEL_STYLE,
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
                <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center', marginTop: -14, borderWidth: 3, borderColor: '#1E3A5F', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, elevation: 6 }}>
                  <Ionicons name="add" size={30} color="#FEFEFE" />
                </View>
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen name="travel" options={{ title: 'Travel', tabBarIcon: icon('airplane') }} />
        <Tabs.Screen name="family" options={{ title: 'Family', tabBarIcon: icon('people') }} />
        <Tabs.Screen name="athlete" options={{ title: 'Athletes', ...hidden }} />
        <Tabs.Screen name="hub" options={{ title: 'Settings', ...hidden }} />
      </Tabs>
      <QuickAddSheet visible={addOpen} onClose={() => setAddOpen(false)} />
    </View>
  );
}
