import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import { useDataRefresh } from '@/providers/DataProvider';

export default function AddSeasonScreen() {
  const ic = useIconColors();
  const { athleteId } = useLocalSearchParams<{ athleteId: string }>();
  const { user } = useAuth();
  const athletes = useSeasonStore((s) => s.athletes);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setActiveSeasonId = useSeasonStore((s) => s.setActiveSeasonId);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const { refresh } = useDataRefresh();

  const athlete = athletes.find((a) => a.id === athleteId);

  const [teamName, setTeamName] = useState('');
  const [clubName, setClubName] = useState('');
  const [seasonYear, setSeasonYear] = useState('2026-2027');
  const [teamCode, setTeamCode] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!teamName.trim()) {
      Alert.alert('Missing field', 'Team name is required.');
      return;
    }
    if (!athleteId || !user) return;

    setSaving(true);
    try {
      const { data: season, error } = await supabase
        .from('seasons')
        .insert({
          athlete_id: athleteId,
          team_name: teamName.trim(),
          club_name: clubName.trim() || null,
          season_year: seasonYear.trim(),
          sport: 'volleyball',
          team_code: teamCode.trim() || null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Switch to the new season
      setActiveSeasonId(season.id);
      if (adminConfig) {
        const updated = { ...adminConfig, active_season_id: season.id };
        setAdminConfig(updated);
        await updateAdminConfig(adminConfig.id, { active_season_id: season.id });
      }

      notifySuccess();
      await refresh();
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to create season');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">New Season</Text>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            className={`px-4 py-1.5 rounded-lg ${saving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FEFEFE" />
            ) : (
              <Text className="text-sm font-semibold text-cream">Create</Text>
            )}
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          {athlete && (
            <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-4 flex-row items-center border border-rally-200 dark:border-rally-800">
              <Ionicons name="person-circle" size={24} color="#3B82B0" />
              <Text className="text-sm font-semibold text-bark dark:text-cream ml-3">
                {athlete.first_name}{athlete.last_name ? ` ${athlete.last_name}` : ''}
              </Text>
            </View>
          )}

          <FormField label="Team Name" value={teamName} onChangeText={setTeamName} placeholder="e.g. AJV Travel 15u" />
          <FormField label="Club Name" value={clubName} onChangeText={setClubName} placeholder="e.g. Austin Juniors" />
          <FormField label="Season Year" value={seasonYear} onChangeText={setSeasonYear} placeholder="e.g. 2026-2027" />
          <FormField label="Team Code (optional)" value={teamCode} onChangeText={setTeamCode} placeholder="For quick ticket access" />

          <Text className="text-xs text-stone mt-4 leading-5">
            After creating the season, you can add tournaments from the Tournaments tab or by pasting a schedule.
          </Text>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
