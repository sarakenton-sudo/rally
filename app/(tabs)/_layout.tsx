import React from 'react';
import { View, Image, Pressable, Platform, Linking } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const logoWhite = require('@/assets/images/rallyhub_lockup_white.png');

function GlobalHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{ paddingTop: insets.top }}
      className="bg-bark"
    >
      {/* Logo row */}
      <View className="items-center px-4 pt-2 pb-1">
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
            style={{ width: 240, height: 64 }}
            resizeMode="contain"
          />
        </Pressable>
        <Pressable
          className="w-9 h-9 rounded-full items-center justify-center active:opacity-70 absolute right-4"
          style={{ top: 8 + insets.top }}
          onPress={() => router.push('/notifications')}
        >
          <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.6)" />
        </Pressable>
      </View>

      {/* Bottom border */}
      <View className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#FEFEFE',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
        tabBarStyle: {
          backgroundColor: '#1E3A5F',
          borderTopColor: 'rgba(255,255,255,0.07)',
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
