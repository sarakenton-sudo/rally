import { View, Text, FlatList, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useIconColors } from '@/lib/colors';
import type { ForwardedEmail } from '@/types/database';

const CLASS_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; bg: string }> = {
  stay_and_play: { icon: 'bed', color: '#7c3aed', label: 'Hotel', bg: 'bg-purple-100' },
  travel_confirmation: { icon: 'airplane', color: '#2563eb', label: 'Travel', bg: 'bg-blue-100' },
  coach_announcement: { icon: 'megaphone', color: '#d97706', label: 'Coach', bg: 'bg-amber-100' },
  schedule_change: { icon: 'swap-horizontal', color: '#dc2626', label: 'Schedule', bg: 'bg-red-100' },
  tournament_info: { icon: 'trophy', color: '#16a34a', label: 'Tournament', bg: 'bg-green-100' },
  other: { icon: 'mail', color: '#6b7280', label: 'Other', bg: 'bg-gray-100' },
};

const ACTION_LABELS: Record<string, string> = {
  booking_alert_sent: 'Booking alert sent',
  travel_import_queued: 'Import queued',
  notification_sent: 'Notification sent',
  none: 'No action',
};

export default function EmailInboxScreen() {
  const ic = useIconColors();
  const emails = useSeasonStore((s) => s.forwardedEmails);
  const teamConfig = useSeasonStore((s) => s.teamConfig);

  const renderItem = ({ item }: { item: ForwardedEmail }) => {
    const cls = CLASS_CONFIG[item.classification] ?? CLASS_CONFIG.other;
    const receivedDate = new Date(item.received_at);

    return (
      <Pressable
        className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-2 border border-gray-100 dark:border-gray-700 active:opacity-80"
        onPress={() => router.push({ pathname: '/email/detail', params: { id: item.id } })}
      >
        <View className="flex-row items-start">
          {/* Classification icon */}
          <View
            className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${cls.bg}`}
          >
            <Ionicons name={cls.icon} size={18} color={cls.color} />
          </View>

          <View className="flex-1">
            {/* Subject + date */}
            <View className="flex-row items-start justify-between">
              <Text className="text-sm font-semibold text-gray-900 dark:text-white flex-1 mr-2" numberOfLines={1}>
                {item.subject}
              </Text>
              <Text className="text-xs text-gray-400">
                {receivedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
            </View>

            {/* From */}
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5" numberOfLines={1}>
              {item.from_address}
            </Text>

            {/* Classification + action badges */}
            <View className="flex-row items-center mt-2 gap-2">
              <View className={`px-2 py-0.5 rounded-full ${cls.bg}`}>
                <Text style={{ color: cls.color }} className="text-xs font-semibold">
                  {cls.label}
                </Text>
              </View>
              {item.action_taken !== 'none' && (
                <View className="px-2 py-0.5 rounded-full bg-green-50">
                  <Text className="text-xs font-medium text-green-700">
                    {ACTION_LABELS[item.action_taken]}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-900" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Forwarded Emails
          </Text>
          <Text className="text-xs text-gray-400">
            {emails.length} email{emails.length !== 1 ? 's' : ''} processed
          </Text>
        </View>
      </View>

      {/* Forward address banner */}
      {teamConfig?.rally_forward_address && (
        <View className="mx-4 mt-3 bg-rally-50 dark:bg-rally-900/20 rounded-xl p-3 flex-row items-center">
          <Ionicons name="mail" size={16} color="#2563eb" />
          <View className="ml-2 flex-1">
            <Text className="text-xs text-gray-500">Forward emails to:</Text>
            <Text className="text-sm font-semibold text-rally-600">{teamConfig.rally_forward_address}</Text>
          </View>
        </View>
      )}

      <FlatList
        data={emails}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        ListEmptyComponent={
          <View className="items-center justify-center py-16">
            <Ionicons name="mail-unread-outline" size={48} color={ic.placeholder} />
            <Text className="text-lg font-semibold text-gray-400 mt-4">No emails yet</Text>
            <Text className="text-sm text-gray-400 mt-1 text-center px-8">
              Forward hotel confirmations, coach messages, or schedule updates to your Rally address. AI will classify and extract the details.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
