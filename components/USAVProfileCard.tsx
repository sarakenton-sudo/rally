import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { USAVProfile } from '@/types/database';

interface USAVProfileCardProps {
  profile: USAVProfile;
  onPress?: () => void;
}

export default function USAVProfileCard({ profile, onPress }: USAVProfileCardProps) {
  const expDate = new Date(profile.expiration_date);
  const now = new Date();
  const daysLeft = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isExpired = daysLeft < 0;
  const isExpiringSoon = daysLeft >= 0 && daysLeft <= 30;

  return (
    <Pressable
      className="bg-warm-white dark:bg-bark-light rounded-xl border border-parchment dark:border-rally-900 overflow-hidden active:opacity-80"
      onPress={onPress}
    >
      {/* Red accent bar */}
      <View className="bg-red-600 h-1.5" />

      <View className="p-4">
        <View className="flex-row items-start justify-between">
          <View className="flex-row items-center flex-1">
            <View className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 items-center justify-center mr-3">
              <Ionicons name="shield-checkmark" size={20} color="#dc2626" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-bold text-bark dark:text-cream">
                {profile.member_name}
              </Text>
              <Text className="text-sm text-stone dark:text-parchment mt-0.5">
                {profile.club_affiliation}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9E8E7E" />
        </View>

        <View className="mt-3 pt-3 border-t border-parchment dark:border-rally-900">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-stone uppercase tracking-wider">Member ID</Text>
              <Text className="text-sm font-semibold text-bark dark:text-cream tracking-wider mt-0.5">
                {profile.member_id}
              </Text>
            </View>

            <View className="items-end">
              <Text className="text-xs text-stone uppercase tracking-wider">Expires</Text>
              <View className="flex-row items-center mt-0.5">
                {(isExpired || isExpiringSoon) && (
                  <Ionicons
                    name={isExpired ? 'alert-circle' : 'warning'}
                    size={14}
                    color={isExpired ? '#dc2626' : '#d97706'}
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text className={`text-sm font-semibold ${
                  isExpired ? 'text-red-600' :
                  isExpiringSoon ? 'text-amber-600' :
                  'text-bark dark:text-cream'
                }`}>
                  {expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {profile.notes && (
          <Text className="text-xs text-stone italic mt-2">{profile.notes}</Text>
        )}
      </View>
    </Pressable>
  );
}
