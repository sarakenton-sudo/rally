import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';

export default function TeamDetailsScreen() {
  const ic = useIconColors();
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const setSeasons = useSeasonStore((s) => s.setSeasons);
  const athletes = useSeasonStore((s) => s.athletes);
  const { user } = useAuth();

  const activeSeason = seasons.find((s) => s.id === activeSeasonId) ?? null;
  const activeAthlete = athletes.find((a) => a.id === activeSeason?.athlete_id) ?? null;
  const athleteDisplayName = [activeAthlete?.first_name, activeAthlete?.last_name].filter(Boolean).join(' ');

  const [teamName, setTeamName] = useState(activeSeason?.team_name ?? '');
  const [seasonYear, setSeasonYear] = useState(activeSeason?.season_year ?? '');
  const [athleteName, setAthleteName] = useState(athleteDisplayName);
  const [teamCode, setTeamCode] = useState(activeSeason?.team_code ?? '');
  const [clubDomain, setClubDomain] = useState(adminConfig?.club_email_domain ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!activeSeason || !adminConfig) return;
    if (!teamName.trim()) {
      Alert.alert('Missing field', 'Team name is required.');
      return;
    }

    setIsSaving(true);

    const seasonUpdates = {
      team_name: teamName.trim(),
      season_year: seasonYear.trim(),
      team_code: teamCode.trim() || null,
    };

    const adminUpdates = {
      club_email_domain: clubDomain.trim() || null,
    };

    try {
      if (isSupabaseConfigured && user) {
        const { error: seasonError } = await supabase
          .from('seasons')
          .update(seasonUpdates)
          .eq('id', activeSeason.id);
        if (seasonError) {
          Alert.alert('Save failed', seasonError.message);
          return;
        }

        const { error: adminError } = await updateAdminConfig(adminConfig.id, adminUpdates);
        if (adminError) {
          Alert.alert('Save failed', adminError.message);
          return;
        }
      }
      setSeasons(seasons.map((s) => s.id === activeSeason.id ? { ...s, ...seasonUpdates } : s));
      setAdminConfig({ ...adminConfig, ...adminUpdates });
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
