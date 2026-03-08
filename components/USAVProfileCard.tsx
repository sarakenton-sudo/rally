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
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden active:opacity-80"
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
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                {profile.member_name}
              </Text>
              <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {profile.club_affiliation}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </View>

        <View className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-gray-400 uppercase tracking-wider">Member ID</Text>
              <Text className="text-sm font-semibold text-gray-900 dark:text-white tracking-wider mt-0.5">
                {profile.member_id}
              </Text>
            </View>

            <View className="items-end">
              <Text className="text-xs text-gray-400 uppercase tracking-wider">Expires</Text>
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
                  'text-gray-900 dark:text-white'
                }`}>
                  {expDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {profile.notes && (
          <Text className="text-xs text-gray-400 italic mt-2">{profile.notes}</Text>
        )}
      </View>
    </Pressable>
  );
}
