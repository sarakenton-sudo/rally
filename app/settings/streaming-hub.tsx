import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { StreamingPlatform } from '@/types/database';

const PLATFORMS: { label: string; value: StreamingPlatform }[] = [
  { label: 'YouTube', value: 'YouTube' },
  { label: 'GameChanger', value: 'GameChanger' },
  { label: 'Baller.tv', value: 'Baller.tv' },
  { label: 'Other', value: 'Other' },
];

export default function StreamingHubScreen() {
  const ic = useIconColors();
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const { user } = useAuth();
  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const [platform, setPlatform] = useState<StreamingPlatform | null>(adminConfig?.default_streaming_platform ?? null);
  const [url, setUrl] = useState(adminConfig?.default_stream_url ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!adminConfig) return;
    if (url.trim() && !url.trim().startsWith('http')) {
      Alert.alert('Invalid URL', 'Please enter a valid URL starting with http:// or https://');
      return;
    }

    setIsSaving(true);
    const updates = {
      default_streaming_platform: platform,
      default_stream_url: url.trim() || null,
    };

    try {
      if (isSupabaseConfigured && user) {
        const { error } = await updateAdminConfig(adminConfig.id, updates);
        if (error) {
          Alert.alert('Save failed', error.message);
          return;
        }
      }
      setAdminConfig({ ...adminConfig, ...updates });
      notifySuccess();
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">
            Streaming Hub
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            className={`px-4 py-1.5 rounded-lg ${isSaving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-cream">{isSaving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          {/* Info banner */}
          <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mb-6 flex-row items-start">
            <Ionicons name="information-circle" size={20} color="#dc2626" />
            <Text className="text-xs text-red-700 dark:text-red-300 ml-3 flex-1">
              This link appears on tournament pages when no specific stream is added. Set your team's default YouTube channel or streaming platform.
            </Text>
          </View>

          {/* Platform picker */}
          <Text className="text-xs text-stone uppercase tracking-wider mb-2 ml-1">Platform</Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {PLATFORMS.map((p) => (
              <Pressable
                key={p.value}
                onPress={() => setPlatform(p.value)}
                className={`px-4 py-2.5 rounded-xl border ${
                  platform === p.value
                    ? 'bg-rally-600 border-rally-600'
                    : 'bg-cream dark:bg-bark-light border-parchment dark:border-rally-900'
                } active:opacity-80`}
              >
                <Text
                  className={`text-sm font-medium ${
                    platform === p.value ? 'text-cream' : 'text-bark dark:text-cream'
                  }`}
                >
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* URL input */}
          <Text className="text-xs text-stone uppercase tracking-wider mb-2 ml-1">Channel / Stream URL</Text>
          <TextInput
            className="bg-cream dark:bg-bark-light rounded-xl px-4 py-3 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
            placeholder="https://youtube.com/@yourchannel"
            placeholderTextColor="#8FA8BF"
            value={url}
            onChangeText={setUrl}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text className="text-xs text-stone dark:text-parchment mt-2 ml-1">
            Must include https:// (e.g. https://youtube.com/@yourchannel)
          </Text>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
