import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, tapLight } from '@/lib/haptics';

export default function EmailConnectScreen() {
  const ic = useIconColors();
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const [copied, setCopied] = useState(false);

  const forwardAddress = adminConfig?.rally_forward_address || 'plans@rally-hub.com';

  const handleCopy = async () => {
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(forwardAddress);
    } else {
      await Clipboard.setStringAsync(forwardAddress);
    }
    tapLight();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">
          Email Forwarding
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Forwarding address card */}
        <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-5 mb-4 border border-rally-200 dark:border-rally-800">
          <Text className="text-xs font-semibold text-stone dark:text-parchment uppercase tracking-wider mb-3">
            Your Forwarding Address
          </Text>
          <Text selectable className="text-lg font-bold text-rally-600 dark:text-rally-300 mb-4">
            {forwardAddress}
          </Text>
          <Pressable
            onPress={handleCopy}
            className={`rounded-lg py-3 items-center flex-row justify-center ${copied ? 'bg-green-100 dark:bg-green-900/30' : 'bg-rally-600'} active:opacity-80`}
          >
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? '#16a34a' : '#FEFEFE'} />
            <Text className={`text-sm font-semibold ml-2 ${copied ? 'text-green-700 dark:text-green-300' : 'text-cream'}`}>
              {copied ? 'Copied!' : 'Copy Address'}
            </Text>
          </Pressable>
        </View>

        {/* How it works */}
        <Text className="text-xs font-semibold text-stone dark:text-parchment uppercase tracking-wider mb-3 ml-1">
          How It Works
        </Text>

        <View className="bg-cream dark:bg-bark-light rounded-xl p-4 mb-4 border border-parchment dark:border-rally-900">
          {[
            { step: '1', icon: 'mail-outline' as const, text: 'Forward any travel or tournament email to the address above' },
            { step: '2', icon: 'sparkles' as const, text: 'RALLY\'s AI reads the email and extracts key details' },
            { step: '3', icon: 'checkmark-circle' as const, text: 'Hotel bookings, flights, and tournament info auto-populate in your dashboard' },
          ].map((item, i) => (
            <View key={item.step} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: i < 2 ? 16 : 0 }}>
              <View className="w-7 h-7 rounded-full bg-rally-100 dark:bg-rally-900/30 items-center justify-center mr-3 mt-0.5">
                <Text className="text-xs font-bold text-rally-600">{item.step}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm text-bark dark:text-cream leading-5">{item.text}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* What to forward */}
        <Text className="text-xs font-semibold text-stone dark:text-parchment uppercase tracking-wider mb-3 ml-1">
          What to Forward
        </Text>

        <View className="bg-cream dark:bg-bark-light rounded-xl p-4 mb-4 border border-parchment dark:border-rally-900">
          {[
            { icon: 'bed-outline' as const, label: 'Hotel confirmations', desc: 'Stay-and-play, Marriott, Hilton, Airbnb, etc.' },
            { icon: 'airplane-outline' as const, label: 'Flight bookings', desc: 'Delta, United, Southwest, etc.' },
            { icon: 'trophy-outline' as const, label: 'Tournament emails', desc: 'Schedule updates, venue info, check-in details' },
            { icon: 'megaphone-outline' as const, label: 'Coach announcements', desc: 'Practice changes, team updates' },
          ].map((item) => (
            <View key={item.label} className="flex-row items-start mb-3 last:mb-0">
              <Ionicons name={item.icon} size={20} color={ic.muted} style={{ marginTop: 2 }} />
              <View className="flex-1 ml-3">
                <Text className="text-sm font-semibold text-bark dark:text-cream">{item.label}</Text>
                <Text className="text-xs text-stone mt-0.5">{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* View inbox */}
        <Pressable
          onPress={() => router.push('/email/inbox')}
          className="bg-cream dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-3 flex-row items-center active:opacity-80"
        >
          <Ionicons name="mail-unread-outline" size={20} color={ic.muted} />
          <Text className="text-sm font-semibold text-bark dark:text-cream ml-3 flex-1">View Email Inbox</Text>
          <Ionicons name="chevron-forward" size={18} color={ic.subtle} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
