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
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">
          Add to Season
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
        {/* Section: Tournament Schedule */}
        <Text className="text-xs font-semibold text-stone uppercase tracking-wider mb-3">Tournament Schedule</Text>

        {/* Card A — Copy/Paste + AI */}
        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-xl p-5 mb-3 border border-parchment dark:border-rally-900 active:opacity-80"
          onPress={() => router.push('/import/paste')}
        >
          <View className="flex-row items-center mb-2">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: '#7c3aed15' }}
            >
              <Ionicons name="sparkles" size={20} color="#7c3aed" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-bark dark:text-cream">Copy / Paste + AI</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ic.subtle} />
          </View>
          <Text className="text-sm text-stone ml-13">
            Paste a coach message or schedule. AI extracts tournaments automatically.
          </Text>
          <Text className="text-xs text-rally-500 dark:text-rally-400 ml-13 mt-2 italic">
            Don't worry, you'll get to approve it before we finalize the schedule.
          </Text>
        </Pressable>

        {/* Card B — Forward Email */}
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
          <Text className="text-sm text-stone ml-13 mb-1">
            Forward a schedule email and AI will extract tournaments.
          </Text>
          {adminConfig?.rally_forward_address && (
            <View className="bg-rally-50 dark:bg-rally-900/20 rounded-lg p-3 ml-13 flex-row items-center">
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

        {/* Card C — LeagueApps (Coming Soon) */}
        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-xl p-3 mb-2 border border-parchment dark:border-rally-900 opacity-50 flex-row items-center"
          onPress={() => Alert.alert(
            'Coming Soon',
            'Direct import from LeagueApps is planned for a future release. Use Copy/Paste or Forward Email for now.'
          )}
        >
          <View
            className="w-8 h-8 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: '#6A9E8A15' }}
          >
            <Ionicons name="trophy" size={16} color="#6A9E8A" />
          </View>
          <Text className="text-sm font-medium text-bark dark:text-cream flex-1">LeagueApps</Text>
          <View className="bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
            <Text className="text-xs font-semibold text-amber-700 dark:text-amber-300">Coming Soon</Text>
          </View>
        </Pressable>

        {/* Card D — TeamSnap (Coming Soon) */}
        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-xl p-3 mb-3 border border-parchment dark:border-rally-900 opacity-50 flex-row items-center"
          onPress={() => Alert.alert(
            'Coming Soon',
            'Direct import from TeamSnap is planned for a future release. Use Copy/Paste or Forward Email for now.'
          )}
        >
          <View
            className="w-8 h-8 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: '#6A9E8A15' }}
          >
            <Ionicons name="people" size={16} color="#6A9E8A" />
          </View>
          <Text className="text-sm font-medium text-bark dark:text-cream flex-1">TeamSnap</Text>
          <View className="bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
            <Text className="text-xs font-semibold text-amber-700 dark:text-amber-300">Coming Soon</Text>
          </View>
        </Pressable>

        {/* Section: Travel Details */}
        <Text className="text-xs font-semibold text-stone uppercase tracking-wider mt-6 mb-3">Travel Details</Text>

        {/* Card D — Paste Travel */}
        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-xl p-5 mb-3 border border-parchment dark:border-rally-900 active:opacity-80"
          onPress={() => router.push('/import/paste-travel')}
        >
          <View className="flex-row items-center mb-2">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: '#7c3aed15' }}
            >
              <Ionicons name="sparkles" size={20} color="#7c3aed" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-bark dark:text-cream">Paste Hotel / Flight</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ic.subtle} />
          </View>
          <Text className="text-sm text-stone ml-13">
            Paste a hotel or flight confirmation email. AI extracts booking details and matches to tournaments.
          </Text>
        </Pressable>

        {/* Card E — Gmail Auto-Import */}
        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-xl p-5 mb-3 border border-parchment dark:border-rally-900 active:opacity-80"
          onPress={() => router.push('/settings/email-forward')}
        >
          <View className="flex-row items-center mb-2">
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: '#3B82B015' }}
            >
              <Ionicons name="mail" size={20} color="#3B82B0" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-bark dark:text-cream">Gmail Auto-Import</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ic.subtle} />
          </View>
          <Text className="text-sm text-stone ml-13">
            Connect Gmail to automatically detect hotel and flight confirmations and add them to your season.
          </Text>
        </Pressable>

        <View className="h-8" />
      </ScrollView>
    </SafeAreaView>
  );
}
