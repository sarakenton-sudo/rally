import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Modal, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { tapLight } from '@/lib/haptics';

export default function GlobalAddFAB() {
  const [visible, setVisible] = useState(false);
  const adminConfig = useSeasonStore((s) => s.adminConfig);

  const dismiss = () => setVisible(false);
  const go = (path: string, params?: Record<string, string>) => {
    dismiss();
    if (params) {
      router.push({ pathname: path as any, params });
    } else {
      router.push(path as any);
    }
  };

  return (
    <>
      {/* FAB */}
      <Pressable
        className="absolute bottom-20 right-5 bg-rally-600 w-14 h-14 rounded-full items-center justify-center shadow-lg active:opacity-80"
        style={{ elevation: 6, zIndex: 50 }}
        onPress={() => setVisible(true)}
      >
        <Ionicons name="add" size={28} color="#FEFEFE" />
      </Pressable>

      {/* Full-screen modal */}
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={dismiss}>
        <View className="flex-1 bg-warm-white dark:bg-bark">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
            <Pressable onPress={dismiss} className="p-1">
              <Ionicons name="close" size={24} color="#8FA8BF" />
            </Pressable>
            <Text className="text-lg font-bold text-bark dark:text-cream">
              Add to Rally
            </Text>
            <View style={{ width: 32 }} />
          </View>

          <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
            {/* Subheadline */}
            <Text className="text-center text-lg font-bold text-bark dark:text-cream mb-3">
              Let's Build Your Beautiful Itinerary 🪄
            </Text>

            {/* Info */}
            <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-5">
              <View className="flex-row items-start">
                <Ionicons name="information-circle" size={18} color="#3B82B0" />
                <Text className="text-sm text-rally-700 dark:text-rally-300 ml-2 flex-1">
                  Add tournaments, hotel bookings, flight confirmations, events, and more. AI figures out what you paste.
                </Text>
              </View>
            </View>

            {/* 1. Paste + AI */}
            <Pressable
              className="bg-warm-white dark:bg-bark-light rounded-xl p-5 mb-3 border border-parchment dark:border-rally-900 active:opacity-80"
              onPress={() => go('/import/paste-combined')}
            >
              <View className="flex-row items-center mb-2">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: '#7c3aed15' }}
                >
                  <Ionicons name="sparkles" size={20} color="#7c3aed" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-bark dark:text-cream">Paste + AI</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8FA8BF" />
              </View>
              <Text className="text-sm text-stone dark:text-parchment ml-13">
                Paste anything — tournament emails, hotel confirmations, flight bookings, coach messages. AI extracts everything.
              </Text>
              <Text className="text-xs text-rally-500 ml-13 mt-2 italic">
                You'll review and approve everything before saving.
              </Text>
            </Pressable>

            {/* 2. Forward Email */}
            <View className="bg-warm-white dark:bg-bark-light rounded-xl p-5 mb-3 border border-parchment dark:border-rally-900">
              <View className="flex-row items-center mb-2">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: '#3B82B015' }}
                >
                  <Ionicons name="mail-open" size={20} color="#3B82B0" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-bark dark:text-cream">Forward Email</Text>
                </View>
              </View>
              <Text className="text-sm text-stone dark:text-parchment ml-13 mb-1">
                Forward any email — schedules, hotel confirmations, flight bookings — and AI will extract the details.
              </Text>
              {adminConfig?.rally_forward_address && (
                <View className="bg-rally-50 dark:bg-rally-900/30 rounded-lg p-3 ml-13 flex-row items-center">
                  <Text className="text-sm font-semibold text-rally-600 dark:text-rally-300 flex-1" numberOfLines={1}>
                    {adminConfig.rally_forward_address}
                  </Text>
                  <Pressable
                    onPress={async () => {
                      await Clipboard.setStringAsync(adminConfig.rally_forward_address);
                      tapLight();
                      if (Platform.OS === 'web') window.alert('Copied!');
                      else Alert.alert('Copied', 'Forward address copied to clipboard.');
                    }}
                    className="bg-rally-600 px-3 py-1.5 rounded-lg active:opacity-80 ml-2"
                  >
                    <Text className="text-xs font-semibold text-cream">Copy</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* 3. Add Manually */}
            <View className="bg-warm-white dark:bg-bark-light rounded-xl p-5 mb-3 border border-parchment dark:border-rally-900">
              <View className="flex-row items-center mb-3">
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: '#6A9E8A15' }}
                >
                  <Ionicons name="create-outline" size={20} color="#6A9E8A" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-bark dark:text-cream">Add Manually</Text>
                </View>
              </View>
              <View className="flex-row flex-wrap gap-3 ml-13">
                <Pressable
                  className="bg-green-50 dark:bg-green-900/20 rounded-xl py-3 items-center active:opacity-80 border border-green-200 dark:border-green-800"
                  style={{ width: '30%' }}
                  onPress={() => {
                    const blank = [{ name: '', start_date: '', end_date: '', location_city: '', venue_name: '', venue_address: '', notes: '' }];
                    go('/import/review', { tournaments: JSON.stringify(blank) });
                  }}
                >
                  <Ionicons name="trophy-outline" size={20} color="#16a34a" />
                  <Text className="text-xs font-semibold text-green-700 dark:text-green-300 mt-1">Tournament</Text>
                </Pressable>
                <Pressable
                  className="bg-purple-50 dark:bg-purple-900/20 rounded-xl py-3 items-center active:opacity-80 border border-purple-200 dark:border-purple-800"
                  style={{ width: '30%' }}
                  onPress={() => go('/booking/add-hotel')}
                >
                  <Ionicons name="bed-outline" size={20} color="#7c3aed" />
                  <Text className="text-xs font-semibold text-purple-700 dark:text-purple-300 mt-1">Hotel</Text>
                </Pressable>
                <Pressable
                  className="bg-rally-50 dark:bg-rally-900/20 rounded-xl py-3 items-center active:opacity-80 border border-rally-200 dark:border-rally-800"
                  style={{ width: '30%' }}
                  onPress={() => go('/booking/add-flight')}
                >
                  <Ionicons name="airplane-outline" size={20} color="#3B82B0" />
                  <Text className="text-xs font-semibold text-rally-600 dark:text-rally-300 mt-1">Flight</Text>
                </Pressable>
                <Pressable
                  className="bg-amber-50 dark:bg-amber-900/20 rounded-xl py-3 items-center active:opacity-80 border border-amber-200 dark:border-amber-800"
                  style={{ width: '30%' }}
                  onPress={() => go('/booking/add-team-event')}
                >
                  <Ionicons name="restaurant-outline" size={20} color="#d97706" />
                  <Text className="text-xs font-semibold text-amber-700 dark:text-amber-300 mt-1">Event</Text>
                </Pressable>
                <Pressable
                  className="bg-pink-50 dark:bg-pink-900/20 rounded-xl py-3 items-center active:opacity-80 border border-pink-200 dark:border-pink-800"
                  style={{ width: '30%' }}
                  onPress={() => go('/guest/add')}
                >
                  <Ionicons name="person-add-outline" size={20} color="#ec4899" />
                  <Text className="text-xs font-semibold text-pink-700 dark:text-pink-300 mt-1">Guest</Text>
                </Pressable>
              </View>
            </View>

            {/* Coming Soon */}
            <Pressable
              className="bg-warm-white dark:bg-bark-light rounded-xl p-3 mb-2 border border-parchment dark:border-rally-900 opacity-50 flex-row items-center"
              onPress={() => {
                if (Platform.OS === 'web') window.alert('Coming Soon: Direct import from LeagueApps.');
                else Alert.alert('Coming Soon', 'Direct import from LeagueApps is planned for a future release.');
              }}
            >
              <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#6A9E8A15' }}>
                <Ionicons name="trophy" size={16} color="#6A9E8A" />
              </View>
              <Text className="text-sm font-medium text-bark dark:text-cream flex-1">LeagueApps</Text>
              <View className="bg-amber-100 px-2 py-0.5 rounded-full">
                <Text className="text-xs font-semibold text-amber-700">Coming Soon</Text>
              </View>
            </Pressable>

            <Pressable
              className="bg-warm-white dark:bg-bark-light rounded-xl p-3 mb-2 border border-parchment dark:border-rally-900 opacity-50 flex-row items-center"
              onPress={() => {
                if (Platform.OS === 'web') window.alert('Coming Soon: Direct import from TeamSnap.');
                else Alert.alert('Coming Soon', 'Direct import from TeamSnap is planned for a future release.');
              }}
            >
              <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#6A9E8A15' }}>
                <Ionicons name="people" size={16} color="#6A9E8A" />
              </View>
              <Text className="text-sm font-medium text-bark dark:text-cream flex-1">TeamSnap</Text>
              <View className="bg-amber-100 px-2 py-0.5 rounded-full">
                <Text className="text-xs font-semibold text-amber-700">Coming Soon</Text>
              </View>
            </Pressable>

            <Pressable
              className="bg-warm-white dark:bg-bark-light rounded-xl p-3 mb-3 border border-parchment dark:border-rally-900 opacity-50 flex-row items-center"
              onPress={() => {
                if (Platform.OS === 'web') window.alert('Coming Soon: Auto-Sync will detect confirmations from your email.');
                else Alert.alert('Coming Soon', 'Auto-Sync will automatically detect confirmations from your email.');
              }}
            >
              <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#3B82B015' }}>
                <Ionicons name="sync" size={16} color="#3B82B0" />
              </View>
              <Text className="text-sm font-medium text-bark dark:text-cream flex-1">Auto-Sync</Text>
              <View className="bg-amber-100 px-2 py-0.5 rounded-full">
                <Text className="text-xs font-semibold text-amber-700">Coming Soon</Text>
              </View>
            </Pressable>

            <View className="h-8" />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
