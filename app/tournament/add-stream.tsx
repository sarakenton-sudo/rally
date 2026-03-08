import { useState } from 'react';
import { View, Text, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { updateTournament } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';

export default function AddStreamScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const tournament = useSeasonStore((s) => s.tournaments.find((t) => t.id === tournamentId));
  const updateTournamentStore = useSeasonStore((s) => s.updateTournament);
  const { user } = useAuth();
  const ic = useIconColors();

  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) {
      Alert.alert('Missing field', 'Please enter a label (e.g. "YouTube - Court 3").');
      return;
    }
    if (!url.trim()) {
      Alert.alert('Missing field', 'Please enter the streaming URL.');
      return;
    }
    if (!tournament) return;

    setIsSaving(true);
    const newLinks = [...tournament.streaming_links, { label: label.trim(), url: url.trim() }];

    try {
      if (isSupabaseConfigured && user) {
        const { error } = await updateTournament(tournament.id, { streaming_links: newLinks });
        if (error) {
          Alert.alert('Save failed', error.message);
          return;
        }
      }
      updateTournamentStore(tournament.id, { streaming_links: newLinks });
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
            Add Streaming Link
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
          <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mb-6 flex-row items-center">
            <Ionicons name="videocam" size={24} color="#dc2626" />
            <Text className="text-sm text-red-700 dark:text-red-300 ml-3 flex-1">
              Add a link so grandparents and family can watch live. They'll see it on their tournament notification.
            </Text>
          </View>

          <FormField
            label="Label"
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. YouTube - Court 3"
          />

          <FormField
            label="Streaming URL"
            value={url}
            onChangeText={setUrl}
            placeholder="https://youtube.com/live/..."
            autoCapitalize="none"
            keyboardType="url"
          />

          {/* Quick-add suggestions */}
          <Text className="text-xs text-stone uppercase tracking-wider mb-2 ml-1">Quick Add</Text>
          <View className="flex-row flex-wrap gap-2 mb-6">
            {['YouTube', 'GameChanger', 'Baller.tv'].map((platform) => (
              <Pressable
                key={platform}
                className="bg-cream dark:bg-bark-light rounded-lg px-3 py-2 border border-parchment dark:border-rally-900 active:opacity-70"
                onPress={() => setLabel(platform)}
              >
                <Text className="text-xs font-medium text-stone dark:text-parchment">{platform}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
