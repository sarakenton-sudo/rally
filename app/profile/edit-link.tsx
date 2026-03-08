import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateTeamConfig } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';

const ICON_OPTIONS = [
  'globe-outline',
  'chatbubbles-outline',
  'school-outline',
  'trophy-outline',
  'shield-outline',
  'videocam-outline',
  'people-outline',
  'link-outline',
  'logo-youtube',
  'calendar-outline',
];

export default function EditLinkScreen() {
  const { index: indexStr } = useLocalSearchParams<{ index?: string }>();
  const editIndex = indexStr != null ? parseInt(indexStr) : -1;

  const teamConfig = useSeasonStore((s) => s.teamConfig);
  const setTeamConfig = useSeasonStore((s) => s.setTeamConfig);
  const { user } = useAuth();

  const ic = useIconColors();
  const existingLink = editIndex >= 0 ? teamConfig?.external_links[editIndex] : null;

  const [label, setLabel] = useState(existingLink?.label ?? '');
  const [url, setUrl] = useState(existingLink?.url ?? '');
  const [iconName, setIconName] = useState(existingLink?.icon_name ?? 'globe-outline');

  const handleSave = async () => {
    if (!label.trim()) {
      Alert.alert('Missing field', 'Please enter a label for this link.');
      return;
    }

    if (!teamConfig) return;

    const updatedLinks = [...teamConfig.external_links];
    const linkData = {
      label: label.trim(),
      url: url.trim(),
      icon_name: iconName,
    };

    if (editIndex >= 0) {
      updatedLinks[editIndex] = linkData;
    } else {
      updatedLinks.push(linkData);
    }

    const updates = { external_links: updatedLinks };

    if (isSupabaseConfigured && user) {
      const { error } = await updateTeamConfig(teamConfig.id, updates);
      if (error) {
        Alert.alert('Save failed', error.message);
        return;
      }
    }

    setTeamConfig({ ...teamConfig, ...updates });
    router.back();
  };

  const handleDelete = () => {
    if (editIndex < 0 || !teamConfig) return;

    Alert.alert('Remove Link', `Remove "${existingLink?.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const updatedLinks = teamConfig.external_links.filter((_, i) => i !== editIndex);
          const updates = { external_links: updatedLinks };

          if (isSupabaseConfigured && user) {
            await updateTeamConfig(teamConfig.id, updates);
          }

          setTeamConfig({ ...teamConfig, ...updates });
          router.back();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-900" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            {editIndex >= 0 ? 'Edit' : 'Add'} Link
          </Text>
          <Pressable
            onPress={handleSave}
            className="bg-rally-600 px-4 py-1.5 rounded-lg active:opacity-80"
          >
            <Text className="text-sm font-semibold text-white">Save</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          <FormField
            label="Label"
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. GroupMe, LeagueApps"
          />

          <FormField
            label="URL"
            value={url}
            onChangeText={setUrl}
            placeholder="https://..."
            keyboardType="url"
            autoCapitalize="none"
          />

          <DropdownField
            label="Icon"
            value={iconName}
            options={ICON_OPTIONS}
            onChange={setIconName}
          />

          {/* Icon preview */}
          <View className="items-center my-4">
            <View className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 items-center">
              <Ionicons
                name={iconName as keyof typeof Ionicons.glyphMap}
                size={32}
                color="#2563eb"
              />
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">
                {label || 'Preview'}
              </Text>
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
