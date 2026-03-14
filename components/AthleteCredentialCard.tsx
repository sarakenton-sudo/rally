import { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { tapLight } from '@/lib/haptics';

// Brand colors for known services
const BRAND_STYLES: Record<string, { bg: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  sportsrecruits: { bg: '#1B4D7E', color: '#FFFFFF', icon: 'school' },
  'university athlete': { bg: '#E8520E', color: '#FFFFFF', icon: 'trophy' },
  hudl: { bg: '#FF6600', color: '#FFFFFF', icon: 'videocam' },
  instagram: { bg: '#E1306C', color: '#FFFFFF', icon: 'logo-instagram' },
};

function getBrand(label: string) {
  const lower = label.toLowerCase();
  for (const [key, style] of Object.entries(BRAND_STYLES)) {
    if (lower.includes(key)) return style;
  }
  return { bg: '#3B82B0', color: '#FFFFFF', icon: 'globe' as keyof typeof Ionicons.glyphMap };
}

interface Props {
  label: string;
  url: string;
  username: string | null;
  password: string | null;
  onEdit: () => void;
}

export default function AthleteCredentialCard({ label, url, username, password, onEdit }: Props) {
  const brand = getBrand(label);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (value: string, field: string) => {
    if (Platform.OS === 'web') {
      await navigator.clipboard.writeText(value);
    } else {
      await Clipboard.setStringAsync(value);
    }
    tapLight();
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const hasCredentials = username || password;

  return (
    <View
      className="bg-warm-white dark:bg-bark-light rounded-2xl mb-3 border border-parchment dark:border-rally-900 overflow-hidden"
      style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 }}
    >
      {/* Brand header */}
      <View className="flex-row items-center p-4 pb-3">
        <View
          className="w-10 h-10 rounded-xl items-center justify-center mr-3"
          style={{ backgroundColor: brand.bg }}
        >
          <Ionicons name={brand.icon} size={22} color={brand.color} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-bark dark:text-cream">{label}</Text>
          {url ? (
            <Text className="text-xs text-rally-600 dark:text-rally-400 mt-0.5" numberOfLines={1}>
              {url.replace(/^https?:\/\//, '')}
            </Text>
          ) : (
            <Text className="text-xs text-stone mt-0.5">No link set</Text>
          )}
        </View>
        <Pressable onPress={onEdit} className="p-2 active:opacity-60">
          <Ionicons name="pencil" size={16} color="#8FA8BF" />
        </Pressable>
      </View>

      {/* Credentials */}
      {hasCredentials ? (
        <View className="px-4 pb-4">
          <View className="bg-cream dark:bg-bark rounded-xl p-3">
            {username ? (
              <Pressable
                className="flex-row items-center justify-between py-1.5 active:opacity-70"
                onPress={() => handleCopy(username, 'username')}
              >
                <View className="flex-row items-center flex-1 mr-2">
                  <Ionicons name="person-outline" size={14} color="#8FA8BF" />
                  <Text className="text-sm text-bark dark:text-parchment ml-2" numberOfLines={1}>
                    {username}
                  </Text>
                </View>
                <Ionicons
                  name={copiedField === 'username' ? 'checkmark' : 'copy-outline'}
                  size={14}
                  color={copiedField === 'username' ? '#16a34a' : '#8FA8BF'}
                />
              </Pressable>
            ) : null}

            {username && password ? (
              <View className="h-px bg-parchment dark:bg-bark-light my-1" />
            ) : null}

            {password ? (
              <Pressable
                className="flex-row items-center justify-between py-1.5 active:opacity-70"
                onPress={() => handleCopy(password, 'password')}
              >
                <View className="flex-row items-center flex-1 mr-2">
                  <Ionicons name="key-outline" size={14} color="#8FA8BF" />
                  <Text className="text-sm text-bark dark:text-parchment ml-2">
                    {'•'.repeat(Math.min(password.length, 12))}
                  </Text>
                </View>
                <Ionicons
                  name={copiedField === 'password' ? 'checkmark' : 'copy-outline'}
                  size={14}
                  color={copiedField === 'password' ? '#16a34a' : '#8FA8BF'}
                />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <Pressable onPress={onEdit} className="px-4 pb-4">
          <View className="bg-cream dark:bg-bark rounded-xl p-3 flex-row items-center justify-center border border-dashed border-parchment dark:border-rally-900">
            <Ionicons name="add" size={14} color="#8FA8BF" />
            <Text className="text-xs text-stone ml-1">Add credentials</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
