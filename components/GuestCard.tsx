import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Guest } from '@/types/database';

interface GuestCardProps {
  guest: Guest;
  onPress?: () => void;
}

const RELATIONSHIP_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Grandma: 'heart',
  Grandpa: 'heart',
  Uncle: 'people',
  Aunt: 'people',
  Friend: 'person',
  Other: 'person-outline',
};

const NOTIF_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  sms: { label: 'SMS', bg: 'bg-green-100', text: 'text-green-700' },
  push: { label: 'Push', bg: 'bg-blue-100', text: 'text-blue-700' },
  both: { label: 'Push + SMS', bg: 'bg-purple-100', text: 'text-purple-700' },
};

export default function GuestCard({ guest, onPress }: GuestCardProps) {
  const icon = RELATIONSHIP_ICONS[guest.relationship] ?? 'person-outline';
  const notif = NOTIF_BADGE[guest.notification_pref] ?? NOTIF_BADGE.sms;

  return (
    <Pressable
      className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-2 border border-gray-100 dark:border-gray-700 flex-row items-center active:opacity-90"
      onPress={onPress}
    >
      {/* Avatar circle */}
      <View className="w-11 h-11 rounded-full bg-rally-100 dark:bg-rally-900/30 items-center justify-center mr-3">
        <Ionicons name={icon} size={20} color="#2563eb" />
      </View>

      {/* Info */}
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {guest.name}
          </Text>
          {guest.default_invited && (
            <View className="bg-rally-50 dark:bg-rally-900/20 px-1.5 py-0.5 rounded ml-2">
              <Text className="text-[10px] font-semibold text-rally-600">AUTO</Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center mt-0.5">
          <Text className="text-xs text-gray-400">{guest.relationship}</Text>
          <Text className="text-xs text-gray-300 mx-1.5">·</Text>
          <Text className="text-xs text-gray-400">{guest.phone}</Text>
        </View>
      </View>

      {/* Notification pref badge */}
      <View className={`px-2 py-0.5 rounded-full ${notif.bg}`}>
        <Text className={`text-[10px] font-semibold ${notif.text}`}>{notif.label}</Text>
      </View>
    </Pressable>
  );
}
