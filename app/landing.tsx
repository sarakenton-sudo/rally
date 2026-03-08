import { View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const FEATURES = [
  {
    icon: 'calendar' as const,
    title: 'Season at a Glance',
    desc: 'Every tournament, deadline, and team event on one dashboard with smart countdowns.',
  },
  {
    icon: 'airplane' as const,
    title: 'Travel Tracker',
    desc: 'Hotels, flights, and cancellation deadlines organized by tournament — never miss a cutoff.',
  },
  {
    icon: 'people' as const,
    title: 'Guest Manager',
    desc: 'Invite grandparents and family, track RSVPs, and share a read-only view — no app needed.',
  },
  {
    icon: 'mail' as const,
    title: 'AI Email Parsing',
    desc: 'Forward confirmations to Rally and AI extracts hotel and flight details automatically.',
  },
  {
    icon: 'videocam' as const,
    title: 'Streaming Hub',
    desc: 'One-tap access to live streams so family never misses a match.',
  },
  {
    icon: 'link' as const,
    title: 'Quick-Launch Hub',
    desc: 'GroupMe, LeagueApps, SportsRecruits — all your team tools in one place with saved logins.',
  },
];

export default function LandingScreen() {
  const { width } = useWindowDimensions();
  const isWide = width > 600;

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Header bar */}
        <View className="flex-row items-center justify-between px-5 py-3">
          <Text className="text-2xl text-rally-600 font-nunito-black">
            Rally<Text className="font-nunito-extrabold opacity-55">HQ</Text>
          </Text>
          <Pressable
            className="px-5 py-2 rounded-full border border-rally-600 active:opacity-70"
            onPress={() => router.push('/auth')}
          >
            <Text className="text-sm font-semibold text-rally-600">Sign In</Text>
          </Pressable>
        </View>

        {/* Hero */}
        <View className="px-6 pt-10 pb-8 items-center">
          <View className="w-20 h-20 rounded-2xl bg-rally-600 items-center justify-center mb-6">
            <Ionicons name="trophy" size={40} color="#FFF8F0" />
          </View>
          <Text
            className="text-4xl font-nunito-black text-bark dark:text-cream text-center"
            style={isWide ? { fontSize: 48 } : undefined}
          >
            Your volleyball season,{'\n'}sorted.
          </Text>
          <Text className="text-base text-stone dark:text-parchment text-center mt-4 max-w-md">
            RALLY is the family hub for travel volleyball. Tournaments, hotels, flights, guests, streaming — everything in one place so you can focus on the game.
          </Text>

          {/* CTA buttons */}
          <View className={`mt-8 w-full max-w-sm ${isWide ? 'flex-row gap-3' : ''}`}>
            <Pressable
              className="bg-rally-600 rounded-xl py-4 items-center active:opacity-80 flex-1"
              onPress={() => router.push('/auth')}
            >
              <Text className="text-base font-semibold text-cream">Get Started</Text>
            </Pressable>
            <Pressable
              className={`border border-rally-600 rounded-xl py-4 items-center active:opacity-70 flex-1 ${isWide ? '' : 'mt-3'}`}
              onPress={() => router.push('/auth')}
            >
              <Text className="text-base font-semibold text-rally-600">Sign In</Text>
            </Pressable>
          </View>
        </View>

        {/* Divider */}
        <View className="h-px bg-parchment dark:bg-bark-light mx-6" />

        {/* Features */}
        <View className="px-6 pt-8">
          <Text className="text-xs text-stone uppercase tracking-widest text-center mb-6">
            Built for volleyball families
          </Text>

          <View className={isWide ? 'flex-row flex-wrap justify-center' : ''}>
            {FEATURES.map((f) => (
              <View
                key={f.title}
                className="mb-5 items-center"
                style={isWide ? { width: '33%', paddingHorizontal: 12 } : undefined}
              >
                <View className="w-12 h-12 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#3B82B015' }}>
                  <Ionicons name={f.icon} size={22} color="#3B82B0" />
                </View>
                <Text className="text-sm font-bold text-bark dark:text-cream text-center">
                  {f.title}
                </Text>
                <Text className="text-xs text-stone dark:text-parchment text-center mt-1 max-w-xs">
                  {f.desc}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Bottom CTA */}
        <View className="px-6 pt-4 items-center">
          <View className="h-px bg-parchment dark:bg-bark-light w-full mb-8" />
          <Text className="text-lg font-bold text-bark dark:text-cream text-center">
            Ready to get organized?
          </Text>
          <Pressable
            className="bg-rally-600 rounded-xl py-4 px-10 items-center active:opacity-80 mt-4"
            onPress={() => router.push('/auth')}
          >
            <Text className="text-base font-semibold text-cream">Create Your Account</Text>
          </Pressable>
          <Text className="text-xs text-stone mt-4 text-center">
            Free for the 2025-2026 season
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
