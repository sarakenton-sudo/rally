import React from 'react';
import { View, Image, Pressable, Platform, Linking } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SeasonSwitcher from '@/components/SeasonSwitcher';

const logoWhite = require('@/assets/images/rallyhub_lockup_white.png');

function GlobalHeader() {
  const insets = useSafeAreaInsets();

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
          onPress={() => router.push('/settings/account')}
        >
          <Ionicons name="person-circle-outline" size={22} color="rgba(255,255,255,0.65)" />
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

        {/* Notifications button (right) */}
        <Pressable
          className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70 absolute right-4"
          style={{
            top: 6 + insets.top,
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}
          onPress={() => router.push('/notifications')}
        >
          <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.65)" />
        </Pressable>
      </View>

      {/* Season switcher — only visible when multiple athletes/seasons */}
      <SeasonSwitcher />

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
