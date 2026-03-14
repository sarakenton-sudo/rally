import { useState } from 'react';
import { View, Text, Pressable, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { tapLight } from '@/lib/haptics';

// App deep link schemes (iOS/Android) — tries app first, falls back to web
const APP_SCHEMES: Record<string, string> = {
  sportsrecruits: 'sportsrecruits://',
  hudl: 'hudl://',
  instagram: 'instagram://',
};

// Brand colors for known services
const BRAND_STYLES: Record<string, { bg: string; color: string; icon: keyof typeof Ionicons.glyphMap; defaultUrl?: string }> = {
  sportsrecruits: { bg: '#1B4D7E', color: '#FFFFFF', icon: 'school', defaultUrl: 'https://my.sportsrecruits.com/login' },
  'university athlete': { bg: '#E8520E', color: '#FFFFFF', icon: 'trophy', defaultUrl: 'https://auth.universityathlete.com/realms/ua/protocol/openid-connect/auth?scope=openid&response_type=code&approval_prompt=auto&redirect_uri=https%3A%2F%2Funiversityathlete.com%2Fauth%2Fkc-plugin-callback&client_id=ua_2fa_login' },
  hudl: { bg: '#FF6600', color: '#FFFFFF', icon: 'videocam', defaultUrl: 'https://identity.hudl.com/u/login' },
  instagram: { bg: '#E1306C', color: '#FFFFFF', icon: 'logo-instagram', defaultUrl: 'https://www.instagram.com' },
  'usa volleyball': { bg: '#dc2626', color: '#FFFFFF', icon: 'shield-checkmark' },
};

function getBrand(label: string) {
  const lower = label.toLowerCase();
  for (const [key, style] of Object.entries(BRAND_STYLES)) {
    if (lower.includes(key)) return style;
  }
  return { bg: '#3B82B0', color: '#FFFFFF', icon: 'globe' as keyof typeof Ionicons.glyphMap, defaultUrl: undefined };
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
  const isUsav = label.toLowerCase().includes('usa volleyball');
  const isLoaded = isUsav ? !!username : !!(url || username || password);
  const hasLink = !!(url || brand.defaultUrl);

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

  const handleOpen = async () => {
    const targetUrl = url || brand.defaultUrl;
    if (!targetUrl) return;
    const fullUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
    if (Platform.OS !== 'web') {
      const appScheme = APP_SCHEMES[label.toLowerCase()];
      if (appScheme) {
        const canOpen = await Linking.canOpenURL(appScheme);
        if (canOpen) {
          await Linking.openURL(appScheme);
          return;
        }
      }
    }
    await Linking.openURL(fullUrl);
  };

  const handleTileTap = () => {
    // USAV: tap to copy membership #
    if (isUsav && username) {
      handleCopy(username, 'username');
      return;
    }
    // Others: open link or edit
    if (hasLink) {
      handleOpen();
    } else {
      onEdit();
    }
  };

  return (
    <Pressable
      className="bg-warm-white dark:bg-bark-light rounded-xl border border-parchment dark:border-rally-900 overflow-hidden active:opacity-90"
      style={{
        shadowColor: '#1E3A5F',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
      onPress={handleTileTap}
    >
      {/* Brand icon + status dot */}
      <View className="items-center pt-4 pb-2">
        <View className="relative">
          <View
            className="w-12 h-12 rounded-2xl items-center justify-center"
            style={{ backgroundColor: brand.bg }}
          >
            <Ionicons name={brand.icon} size={24} color={brand.color} />
          </View>
          {isLoaded && (
            <View
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-warm-white dark:border-bark-light"
            />
          )}
        </View>
        <Text className="text-xs font-bold text-bark dark:text-cream mt-2 text-center" numberOfLines={1}>
          {label}
        </Text>
      </View>

      {/* Credential rows */}
      {isUsav ? (
        // USA Volleyball — just membership #
        username ? (
          <View className="px-2.5 pb-2.5">
            <Pressable
              className="flex-row items-center bg-cream dark:bg-bark rounded-lg px-2.5 py-1.5 mb-1 active:opacity-70"
              onPress={() => handleCopy(username, 'username')}
            >
              <Ionicons name="card-outline" size={11} color="#8FA8BF" />
              <Text className="text-[11px] text-bark dark:text-parchment ml-1.5 flex-1" numberOfLines={1}>
                #{username}
              </Text>
              <Ionicons
                name={copiedField === 'username' ? 'checkmark' : 'copy-outline'}
                size={11}
                color={copiedField === 'username' ? '#16a34a' : '#8FA8BF'}
              />
            </Pressable>
          </View>
        ) : (
          <View className="px-2.5 pb-3">
            <Text className="text-[10px] text-stone text-center">Tap to add Member #</Text>
          </View>
        )
      ) : (username || password) ? (
        <View className="px-2.5 pb-2.5">
          {username ? (
            <Pressable
              className="flex-row items-center bg-cream dark:bg-bark rounded-lg px-2.5 py-1.5 mb-1 active:opacity-70"
              onPress={() => handleCopy(username, 'username')}
            >
              <Ionicons name="person-outline" size={11} color="#8FA8BF" />
              <Text className="text-[11px] text-bark dark:text-parchment ml-1.5 flex-1" numberOfLines={1}>
                {username}
              </Text>
              <Ionicons
                name={copiedField === 'username' ? 'checkmark' : 'copy-outline'}
                size={11}
                color={copiedField === 'username' ? '#16a34a' : '#8FA8BF'}
              />
            </Pressable>
          ) : null}

          {password ? (
            <Pressable
              className="flex-row items-center bg-cream dark:bg-bark rounded-lg px-2.5 py-1.5 mb-1 active:opacity-70"
              onPress={() => handleCopy(password, 'password')}
            >
              <Ionicons name="key-outline" size={11} color="#8FA8BF" />
              <Text className="text-[11px] text-bark dark:text-parchment ml-1.5 flex-1">
                {'•'.repeat(Math.min(password.length, 10))}
              </Text>
              <Ionicons
                name={copiedField === 'password' ? 'checkmark' : 'copy-outline'}
                size={11}
                color={copiedField === 'password' ? '#16a34a' : '#8FA8BF'}
              />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View className="px-2.5 pb-3">
          <Text className="text-[10px] text-stone text-center">Tap to set up</Text>
        </View>
      )}

      {/* Edit link */}
      <Pressable
        className="border-t border-parchment dark:border-rally-900 py-1.5 active:opacity-60"
        onPress={onEdit}
      >
        <Text className="text-[10px] text-rally-600 font-semibold text-center">Edit</Text>
      </Pressable>
    </Pressable>
  );
}
