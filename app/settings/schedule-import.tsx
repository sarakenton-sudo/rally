import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';

export default function ScheduleImportScreen() {
  const ic = useIconColors();
  const adminConfig = useSeasonStore((s) => s.adminConfig);

  return (
    <SafeAreaView className="flex-1 bg-warm-white" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark">
          Add Tournament & Travel Details
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
        {/* Info */}
        <View className="bg-rally-50 rounded-xl p-4 mb-5">
          <View className="flex-row items-start">
            <Ionicons name="information-circle" size={18} color="#3B82B0" />
            <Text className="text-sm text-rally-700 ml-2 flex-1">
              Add tournaments, hotel bookings, flight confirmations, and more. AI figures out what you paste.
            </Text>
          </View>
        </View>

        {/* 1. Paste + AI */}
        <Pressable
          className="bg-warm-white rounded-xl p-5 mb-3 border border-parchment active:opacity-80"
          onPress={() => router.push('/import/paste-combined')}
        >
          <View className="flex-row items-center mb-2">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: '#7c3aed15' }}
            >
              <Ionicons name="sparkles" size={20} color="#7c3aed" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-bark">Paste + AI</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ic.subtle} />
          </View>
          <Text className="text-sm text-stone ml-13">
            Paste anything — tournament emails, hotel confirmations, flight bookings, coach messages. AI extracts everything.
          </Text>
          <Text className="text-xs text-rally-500 ml-13 mt-2 italic">
            You'll review and approve everything before saving.
          </Text>
        </Pressable>

        {/* 2. Forward Email */}
        <View className="bg-warm-white rounded-xl p-5 mb-3 border border-parchment">
          <View className="flex-row items-center mb-2">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: '#3B82B015' }}
            >
              <Ionicons name="mail-open" size={20} color="#3B82B0" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-bark">Forward Email</Text>
            </View>
          </View>
          <Text className="text-sm text-stone ml-13 mb-1">
            Forward any email — schedules, hotel confirmations, flight bookings — and AI will extract the details.
          </Text>
          {adminConfig?.rally_forward_address && (
            <View className="bg-rally-50 rounded-lg p-3 ml-13 flex-row items-center">
              <Text className="text-sm font-semibold text-rally-600 flex-1" numberOfLines={1}>
                {adminConfig.rally_forward_address}
              </Text>
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(adminConfig.rally_forward_address);
                  tapLight();
                  Alert.alert('Copied', 'Forward address copied to clipboard.');
                }}
                className="bg-rally-600 px-3 py-1.5 rounded-lg active:opacity-80 ml-2"
              >
                <Text className="text-xs font-semibold text-cream">Copy</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* 3. Add Manually */}
        <View className="bg-warm-white rounded-xl p-5 mb-3 border border-parchment">
          <View className="flex-row items-center mb-3">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: '#6A9E8A15' }}
            >
              <Ionicons name="create-outline" size={20} color="#6A9E8A" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-bark">Add Manually</Text>
            </View>
          </View>
          <View className="flex-row gap-3 ml-13">
            <Pressable
              className="flex-1 bg-rally-50 rounded-xl py-3 items-center active:opacity-80 border border-rally-200"
              onPress={() => {
                const blank = [{ name: '', start_date: '', end_date: '', location_city: '', venue_name: '', venue_address: '', notes: '' }];
                router.push({ pathname: '/import/review', params: { tournaments: JSON.stringify(blank) } });
              }}
            >
              <Ionicons name="trophy-outline" size={20} color="#6A9E8A" />
              <Text className="text-xs font-semibold text-green-700 mt-1">Tournament</Text>
            </Pressable>
            <Pressable
              className="flex-1 bg-rally-50 rounded-xl py-3 items-center active:opacity-80 border border-rally-200"
              onPress={() => router.push('/booking/add-hotel')}
            >
              <Ionicons name="bed-outline" size={20} color="#3B82B0" />
              <Text className="text-xs font-semibold text-rally-600 mt-1">Hotel</Text>
            </Pressable>
            <Pressable
              className="flex-1 bg-rally-50 rounded-xl py-3 items-center active:opacity-80 border border-rally-200"
              onPress={() => router.push('/booking/add-flight')}
            >
              <Ionicons name="airplane-outline" size={20} color="#3B82B0" />
              <Text className="text-xs font-semibold text-rally-600 mt-1">Flight</Text>
            </Pressable>
          </View>
        </View>

        {/* Coming Soon */}
        <Pressable
          className="bg-warm-white rounded-xl p-3 mb-2 border border-parchment opacity-50 flex-row items-center"
          onPress={() => Alert.alert('Coming Soon', 'Direct import from LeagueApps is planned for a future release.')}
        >
          <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#6A9E8A15' }}>
            <Ionicons name="trophy" size={16} color="#6A9E8A" />
          </View>
          <Text className="text-sm font-medium text-bark flex-1">LeagueApps</Text>
          <View className="bg-amber-100 px-2 py-0.5 rounded-full">
            <Text className="text-xs font-semibold text-amber-700">Coming Soon</Text>
          </View>
        </Pressable>

        <Pressable
          className="bg-warm-white rounded-xl p-3 mb-2 border border-parchment opacity-50 flex-row items-center"
          onPress={() => Alert.alert('Coming Soon', 'Direct import from TeamSnap is planned for a future release.')}
        >
          <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#6A9E8A15' }}>
            <Ionicons name="people" size={16} color="#6A9E8A" />
          </View>
          <Text className="text-sm font-medium text-bark flex-1">TeamSnap</Text>
          <View className="bg-amber-100 px-2 py-0.5 rounded-full">
            <Text className="text-xs font-semibold text-amber-700">Coming Soon</Text>
          </View>
        </Pressable>

        <Pressable
          className="bg-warm-white rounded-xl p-3 mb-3 border border-parchment opacity-50 flex-row items-center"
          onPress={() => Alert.alert('Coming Soon', 'Auto-Sync will automatically detect confirmations from your email.')}
        >
          <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#3B82B015' }}>
            <Ionicons name="sync" size={16} color="#3B82B0" />
          </View>
          <Text className="text-sm font-medium text-bark flex-1">Auto-Sync</Text>
          <View className="bg-amber-100 px-2 py-0.5 rounded-full">
            <Text className="text-xs font-semibold text-amber-700">Coming Soon</Text>
          </View>
        </Pressable>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
