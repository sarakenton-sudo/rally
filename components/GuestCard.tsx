import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Guest } from '@/types/database';

/** Guest row + fan-app status (00086). */
export type GuestWithFan = Guest & { invite_status?: 'none' | 'sent' | 'joined' | null; invite_code?: string | null };

interface GuestCardProps {
  guest: GuestWithFan;
  onPress?: () => void;
  onInvite?: () => void;
  inviting?: boolean;
}

const RELATIONSHIP_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Grandma: 'heart',
  Grandpa: 'heart',
  Uncle: 'people',
  Aunt: 'people',
  Friend: 'person',
  Other: 'person-outline',
};

export default function GuestCard({ guest, onPress, onInvite, inviting }: GuestCardProps) {
  const icon = RELATIONSHIP_ICONS[guest.relationship] ?? 'person-outline';
  const status = guest.invite_status ?? 'none';
  const contact = guest.email || guest.phone || '';

  return (
    <Pressable
      className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-90"
      style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
      onPress={onPress}
      accessibilityLabel={`${guest.name}, ${guest.relationship}`}
    >
      <View className="w-11 h-11 rounded-full bg-rally-100 dark:bg-rally-900/30 items-center justify-center mr-3">
        <Ionicons name={icon} size={20} color="#3B82B0" />
      </View>

      <View className="flex-1">
        <View className="flex-row items-center">
          <Text className="text-base font-semibold text-bark dark:text-cream">{guest.name}</Text>
          {guest.default_invited && (
            <View className="bg-rally-50 dark:bg-rally-900/20 px-1.5 py-0.5 rounded ml-2">
              <Text className="text-[10px] font-semibold text-rally-600">AUTO</Text>
            </View>
          )}
        </View>
        <Text className="text-xs text-stone mt-0.5" numberOfLines={1}>
          {[guest.relationship, contact].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {status === 'joined' ? (
        <View className="flex-row items-center px-2 py-1 rounded-full bg-green-100">
          <Ionicons name="phone-portrait" size={11} color="#15803d" />
          <Text className="text-[10px] font-bold text-green-700 ml-1">ON THE APP</Text>
        </View>
      ) : (
        <Pressable
          onPress={onInvite}
          disabled={inviting}
          hitSlop={6}
          className="rounded-full px-3 py-1.5 border border-rally-600 active:opacity-70"
          accessibilityLabel={status === 'sent' ? `Resend app invite to ${guest.name}` : `Invite ${guest.name} to the app`}
        >
          <Text className="text-xs font-bold text-rally-600">{inviting ? '…' : status === 'sent' ? 'Resend' : 'Invite to app'}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}
