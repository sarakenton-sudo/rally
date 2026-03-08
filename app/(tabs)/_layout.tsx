import React from 'react';
import { View, Image, Pressable } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/components/useColorScheme';

const TAB_ACTIVE_COLOR = '#3B82B0';
const TAB_INACTIVE_COLOR = '#8FA8BF';

const logoLight = require('@/assets/images/rallyhub_lockup_light.png');
const logoWhite = require('@/assets/images/rallyhub_lockup_white.png');

function GlobalHeader() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';

  return (
    <View
      style={{ paddingTop: insets.top }}
      className={isDark ? 'bg-bark' : 'bg-warm-white'}
    >
      {/* Logo row */}
      <View className="items-center px-4 pt-2 pb-1">
        <Image
          source={isDark ? logoWhite : logoLight}
          style={{ width: 240, height: 64 }}
          resizeMode="contain"
        />
        <Pressable
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70 absolute right-4"
          style={{ top: 8 + insets.top }}
          onPress={() => router.push('/notifications')}
        >
          <Ionicons name="notifications-outline" size={20} color="#8FA8BF" />
        </Pressable>
      </View>

      {/* Bottom border */}
      <View className={`h-px ${isDark ? 'bg-bark-light' : 'bg-parchment'}`} />
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: TAB_ACTIVE_COLOR,
        tabBarInactiveTintColor: TAB_INACTIVE_COLOR,
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#1E3A5F' : '#FEFEFE',
          borderTopColor: colorScheme === 'dark' ? '#152F43' : '#D8E2EC',
        },
        header: () => <GlobalHeader />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="season"
        options={{
          title: 'Tournaments',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="travel"
        options={{
          title: 'Travel',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="airplane" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="guests"
        options={{
          title: 'Guests',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="hub"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
