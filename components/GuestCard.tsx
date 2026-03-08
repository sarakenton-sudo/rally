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


export default function GuestCard({ guest, onPress }: GuestCardProps) {
  const icon = RELATIONSHIP_ICONS[guest.relationship] ?? 'person-outline';

  return (
    <Pressable
      className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-90"
      onPress={onPress}
    >
      {/* Avatar circle */}
      <View className="w-11 h-11 rounded-full bg-rally-100 dark:bg-rally-900/30 items-center justify-center mr-3">
        <Ionicons name={icon} size={20} color="#3B82B0" />
      </View>

      {/* Info */}
      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-base font-semibold text-bark dark:text-cream">
            {guest.name}
          </Text>
          {guest.default_invited && (
            <View className="bg-rally-50 dark:bg-rally-900/20 px-1.5 py-0.5 rounded ml-2">
              <Text className="text-[10px] font-semibold text-rally-600">AUTO</Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center mt-0.5">
          <Text className="text-xs text-stone">{guest.relationship}</Text>
          <Text className="text-xs text-parchment mx-1.5">·</Text>
          <Text className="text-xs text-stone">{guest.phone}</Text>
        </View>
      </View>

      {/* SMS badge */}
      <View className="px-2 py-0.5 rounded-full bg-green-100">
        <Text className="text-[10px] font-semibold text-green-700">SMS</Text>
      </View>
    </Pressable>
  );
}
