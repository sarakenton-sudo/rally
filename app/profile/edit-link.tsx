import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import FormField from '@/components/FormField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';

// Auto-assign icon based on label
const ICON_MAP: Record<string, string> = {
  'groupme': 'chatbubbles-outline',
  'leagueapps': 'trophy-outline',
  'teamsnap': 'people-outline',
  'sportsengine': 'globe-outline',
  'sportsrecruits': 'school-outline',
  'usa volleyball': 'shield-outline',
  'hudl': 'videocam-outline',
  'university athlete': 'trophy-outline',
  'youtube': 'logo-youtube',
};

function getIconForLabel(label: string): string {
  const lower = label.toLowerCase();
  for (const [key, icon] of Object.entries(ICON_MAP)) {
    if (lower.includes(key)) return icon;
  }
  return 'globe-outline';
}

export default function EditLinkScreen() {
  const { index: indexStr } = useLocalSearchParams<{ index?: string }>();
  const editIndex = indexStr != null ? parseInt(indexStr) : -1;

  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const { user } = useAuth();

  const ic = useIconColors();
  const existingLink = editIndex >= 0 ? adminConfig?.external_links[editIndex] : null;

  const [label, setLabel] = useState(existingLink?.label ?? '');
  const [url, setUrl] = useState(existingLink?.url ?? '');
  const [username, setUsername] = useState(existingLink?.username ?? '');
  const [password, setPassword] = useState(existingLink?.password ?? '');

  const handleCopy = async (value: string, fieldLabel: string) => {
    await Clipboard.setStringAsync(value);
    tapLight();
    Alert.alert('Copied', `${fieldLabel} copied to clipboard.`);
  };

  const handleSave = async () => {
    if (!label.trim()) {
      Alert.alert('Missing field', 'Please enter a label for this link.');
      return;
    }

    if (!adminConfig) return;

    const updatedLinks = [...adminConfig.external_links];
    const linkData = {
      label: label.trim(),
      url: url.trim(),
      icon_name: getIconForLabel(label.trim()),
      username: username.trim() || null,
      password: password.trim() || null,
    };

    if (editIndex >= 0) {
      updatedLinks[editIndex] = linkData;
    } else {
      updatedLinks.push(linkData);
    }

    const updates = { external_links: updatedLinks };

    if (isSupabaseConfigured && user) {
      const { error } = await updateAdminConfig(adminConfig.id, updates);
      if (error) {
        Alert.alert('Save failed', error.message);
        return;
      }
    }

    setAdminConfig({ ...adminConfig, ...updates });
    router.back();
  };

  const handleDelete = () => {
    if (editIndex < 0 || !adminConfig) return;

    Alert.alert('Remove Link', `Remove "${existingLink?.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const updatedLinks = adminConfig.external_links.filter((_, i) => i !== editIndex);
          const updates = { external_links: updatedLinks };

          if (isSupabaseConfigured && user) {
            await updateAdminConfig(adminConfig.id, updates);
          }

          setAdminConfig({ ...adminConfig, ...updates });
          router.back();
        },
      },
    ]);
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
            {editIndex >= 0 ? 'Edit' : 'Add'} Link
          </Text>
          <Pressable
            onPress={handleSave}
            className="bg-rally-600 px-4 py-1.5 rounded-lg active:opacity-80"
          >
            <Text className="text-sm font-semibold text-cream">Save</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          <FormField label="Label" value={label} onChangeText={setLabel} placeholder="e.g. GroupMe, LeagueApps" />
          <FormField label="URL" value={url} onChangeText={setUrl} placeholder="https://..." keyboardType="url" autoCapitalize="none" />

          {/* Credentials section */}
          <View className="mt-2 mb-4">
            <Text className="text-xs font-semibold text-stone uppercase tracking-wider mb-3">Login Credentials</Text>

            <View className="flex-row items-end mb-4">
              <View className="flex-1 mr-2">
                <FormField label="Username" value={username} onChangeText={setUsername} placeholder="email or username" autoCapitalize="none" />
              </View>
              {username ? (
                <Pressable
                  onPress={() => handleCopy(username, 'Username')}
                  className="bg-cream dark:bg-bark-light rounded-xl p-3 mb-4 active:opacity-70"
                >
                  <Ionicons name="copy-outline" size={18} color="#3B82B0" />
                </Pressable>
              ) : null}
            </View>

            <View className="flex-row items-end">
              <View className="flex-1 mr-2">
                <FormField label="Password" value={password} onChangeText={setPassword} placeholder="password" secureTextEntry autoCapitalize="none" />
              </View>
              {password ? (
                <Pressable
                  onPress={() => handleCopy(password, 'Password')}
                  className="bg-cream dark:bg-bark-light rounded-xl p-3 mb-4 active:opacity-70"
                >
                  <Ionicons name="copy-outline" size={18} color="#3B82B0" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {editIndex >= 0 && (
            <Pressable
              className="mt-4 py-3 items-center rounded-xl border border-red-200 dark:border-red-800 active:opacity-80"
              onPress={handleDelete}
            >
              <Text className="text-sm font-semibold text-red-600">Remove Link</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
