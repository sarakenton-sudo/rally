import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/components/useColorScheme';

const TAB_ACTIVE_COLOR = '#C4714A';
const TAB_INACTIVE_COLOR = '#9E8E7E';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: TAB_ACTIVE_COLOR,
        tabBarInactiveTintColor: TAB_INACTIVE_COLOR,
        tabBarStyle: {
          backgroundColor: colorScheme === 'dark' ? '#3D2E22' : '#FAF7F3',
          borderTopColor: colorScheme === 'dark' ? '#5E2F1E' : '#EDE4D6',
        },
        headerStyle: {
          backgroundColor: colorScheme === 'dark' ? '#3D2E22' : '#FAF7F3',
        },
        headerTintColor: colorScheme === 'dark' ? '#F5EFE6' : '#3D2E22',
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
          title: 'Season',
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
          title: 'Hub',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="link" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
