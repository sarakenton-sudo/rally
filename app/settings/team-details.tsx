import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateTeamConfig } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';

export default function TeamDetailsScreen() {
  const ic = useIconColors();
  const teamConfig = useSeasonStore((s) => s.teamConfig);
  const setTeamConfig = useSeasonStore((s) => s.setTeamConfig);
  const { user } = useAuth();

  const [teamName, setTeamName] = useState(teamConfig?.team_name ?? '');
  const [seasonYear, setSeasonYear] = useState(teamConfig?.season_year ?? '');
  const [athleteName, setAthleteName] = useState(teamConfig?.athlete_name ?? '');
  const [teamCode, setTeamCode] = useState(teamConfig?.team_code ?? '');
  const [clubDomain, setClubDomain] = useState(teamConfig?.club_email_domain ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!teamConfig) return;
    if (!teamName.trim()) {
      Alert.alert('Missing field', 'Team name is required.');
      return;
    }

    setIsSaving(true);

    const updates = {
      team_name: teamName.trim(),
      season_year: seasonYear.trim(),
      athlete_name: athleteName.trim() || null,
      team_code: teamCode.trim() || null,
      club_email_domain: clubDomain.trim() || null,
    };

    try {
      if (isSupabaseConfigured && user) {
        const { error } = await updateTeamConfig(teamConfig.id, updates);
        if (error) {
          Alert.alert('Save failed', error.message);
          return;
        }
      }
      setTeamConfig({ ...teamConfig, ...updates });
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
            Team Details
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
          <FormField label="Team Name" value={teamName} onChangeText={setTeamName} placeholder="e.g. AJV Travel 14u" />
          <FormField label="Season" value={seasonYear} onChangeText={setSeasonYear} placeholder="e.g. 2025-2026" />
          <FormField label="Athlete Name" value={athleteName} onChangeText={setAthleteName} placeholder="e.g. Avery Kenton" />
          <FormField label="Team Code" value={teamCode} onChangeText={setTeamCode} placeholder="e.g. AJV14U" autoCapitalize="characters" />
          <FormField label="Club Email Domain" value={clubDomain} onChangeText={setClubDomain} placeholder="e.g. austinjuniors.com" keyboardType="url" autoCapitalize="none" />

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
