import { useState } from 'react';
import { View, Text, Pressable, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { tapLight } from '@/lib/haptics';

// App deep link schemes (iOS/Android) — tries app first, falls back to web
const APP_SCHEMES: Record<string, string> = {
  instagram: 'instagram://',
  hudl: 'hudl://',
};

// Services that only store a membership/ID number (no URL, no password)
const MEMBERSHIP_ONLY = ['usa volleyball'];

// Brand colors for known services
const BRAND_STYLES: Record<string, { bg: string; color: string; icon: keyof typeof Ionicons.glyphMap; defaultUrl?: string }> = {
  sportsrecruits: { bg: '#1B4D7E', color: '#FFFFFF', icon: 'school', defaultUrl: 'https://my.sportsrecruits.com/login' },
  'university athlete': { bg: '#E8520E', color: '#FFFFFF', icon: 'trophy', defaultUrl: 'https://universityathlete.com' },
  hudl: { bg: '#FF6600', color: '#FFFFFF', icon: 'videocam', defaultUrl: 'https://identity.hudl.com/u/login/identifier' },
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
  const lower = label.toLowerCase();
  const isMembershipOnly = MEMBERSHIP_ONLY.some((k) => lower.includes(k));
  const isLoaded = isMembershipOnly ? !!username : !!(username || password);
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
      const appScheme = APP_SCHEMES[lower];
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

  const handleIconTap = () => {
    if (isMembershipOnly && username) {
      handleCopy(username, 'username');
      return;
    }
    if (hasLink) {
      handleOpen();
    } else {
      onEdit();
    }
  };

  return (
    <View
      className="bg-warm-white dark:bg-bark-light rounded-xl border border-parchment dark:border-rally-900 overflow-hidden"
      style={{
        shadowColor: '#1E3A5F',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* Brand icon + status dot — tapping opens the service URL */}
      <Pressable className="items-center pt-4 pb-3 active:opacity-80" onPress={handleIconTap}>
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
        {hasLink && (
          <View className="flex-row items-center mt-1">
            <Ionicons name="open-outline" size={10} color="#8FA8BF" />
            <Text className="text-[9px] text-stone ml-0.5">Open</Text>
          </View>
        )}
      </Pressable>

      {/* Bottom action bar */}
      {isLoaded ? (
        // Loaded: light green bar with UN | PW | Edit
        <View
          className="flex-row"
          style={{ backgroundColor: 'rgba(22,163,106,0.08)', borderTopWidth: 1, borderTopColor: 'rgba(22,163,106,0.15)' }}
        >
          {username ? (
            <Pressable
              className="flex-1 flex-row items-center justify-center py-2.5 active:opacity-60"
              style={{ borderRightWidth: 1, borderRightColor: 'rgba(22,163,106,0.15)' }}
              onPress={() => handleCopy(username, 'username')}
            >
              <Ionicons
                name={copiedField === 'username' ? 'checkmark-circle' : (isMembershipOnly ? 'card-outline' : 'person-outline')}
                size={14}
                color={copiedField === 'username' ? '#16a34a' : '#22c55e'}
              />
              <Ionicons
                name={copiedField === 'username' ? 'checkmark' : 'copy-outline'}
                size={11}
                color={copiedField === 'username' ? '#16a34a' : '#22c55e'}
                style={{ marginLeft: 4 }}
              />
            </Pressable>
          ) : null}
          {password && !isMembershipOnly ? (
            <Pressable
              className="flex-1 flex-row items-center justify-center py-2.5 active:opacity-60"
              style={{ borderRightWidth: 1, borderRightColor: 'rgba(22,163,106,0.15)' }}
              onPress={() => handleCopy(password, 'password')}
            >
              <Ionicons
                name={copiedField === 'password' ? 'checkmark-circle' : 'key-outline'}
                size={14}
                color={copiedField === 'password' ? '#16a34a' : '#22c55e'}
              />
              <Ionicons
                name={copiedField === 'password' ? 'checkmark' : 'copy-outline'}
                size={11}
                color={copiedField === 'password' ? '#16a34a' : '#22c55e'}
                style={{ marginLeft: 4 }}
              />
            </Pressable>
          ) : null}
          <Pressable
            className="flex-1 items-center justify-center py-2.5 active:opacity-60"
            onPress={onEdit}
          >
            <Ionicons name="pencil" size={13} color="#22c55e" />
          </Pressable>
        </View>
      ) : (
        // Empty: Add Credentials button
        <Pressable
          className="border-t border-parchment dark:border-rally-900 py-2.5 active:opacity-60"
          onPress={onEdit}
        >
          <Text className="text-[11px] text-rally-600 font-semibold text-center">Add Credentials</Text>
        </Pressable>
      )}
    </View>
  );
}
