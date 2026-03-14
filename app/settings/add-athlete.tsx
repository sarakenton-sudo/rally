import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import { useDataRefresh } from '@/providers/DataProvider';

export default function AddAthleteScreen() {
  const ic = useIconColors();
  const { user } = useAuth();
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setActiveSeasonId = useSeasonStore((s) => s.setActiveSeasonId);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const { refresh } = useDataRefresh();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [clubName, setClubName] = useState('');
  const [seasonYear, setSeasonYear] = useState('2026-2027');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showError = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      setError(message);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!firstName.trim()) {
      showError('Missing field', 'First name is required.');
      return;
    }
    if (!teamName.trim()) {
      showError('Missing field', 'Team name is required.');
      return;
    }
    if (!user) {
      showError('Not signed in', 'Please sign in first.');
      return;
    }

    setSaving(true);
    console.log('[add-athlete] Starting create for:', firstName.trim(), 'user:', user.id);
    try {
      // Use RPC to create athlete + link + season in one call (avoids RLS chicken-and-egg)
      const { data: result, error: rpcErr } = await supabase.rpc('create_athlete_with_season', {
        p_first_name: firstName.trim(),
        p_last_name: lastName.trim() || null,
        p_team_name: teamName.trim(),
        p_club_name: clubName.trim() || null,
        p_season_year: seasonYear.trim(),
      });

      console.log('[add-athlete] RPC result:', result, 'error:', rpcErr);
      if (rpcErr) throw rpcErr;

      const athlete = { id: result.athlete_id };
      const season = { id: result.season_id };

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
      showError('Error', err.message ?? 'Failed to create athlete');
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
          <Text className="text-lg font-bold text-bark dark:text-cream">Add Athlete</Text>
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
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-4 flex-row items-start border border-rally-200 dark:border-rally-800">
            <Ionicons name="information-circle" size={18} color="#3B82B0" style={{ marginTop: 1 }} />
            <Text className="text-xs text-rally-700 dark:text-rally-300 ml-3 flex-1 leading-5">
              Add another player to your account. Each athlete has their own seasons and tournaments.
            </Text>
          </View>

          <Text className="text-xs font-semibold text-stone uppercase tracking-wider mb-2 ml-1">Athlete</Text>
          <FormField label="First Name" value={firstName} onChangeText={setFirstName} placeholder="e.g. Jake" />
          <FormField label="Last Name (optional)" value={lastName} onChangeText={setLastName} placeholder="" />

          <Text className="text-xs font-semibold text-stone uppercase tracking-wider mb-2 ml-1 mt-4">First Season</Text>
          <FormField label="Team Name" value={teamName} onChangeText={setTeamName} placeholder="e.g. CEVA 12u" />
          <FormField label="Club Name" value={clubName} onChangeText={setClubName} placeholder="e.g. Central Texas VB" />
          <FormField label="Season Year" value={seasonYear} onChangeText={setSeasonYear} placeholder="e.g. 2026-2027" />

          {error && (
            <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mt-4 flex-row items-start">
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text className="text-sm text-red-700 dark:text-red-300 ml-2 flex-1">{error}</Text>
            </View>
          )}

          <Text className="text-xs text-stone mt-4 leading-5">
            After creating, you can add tournaments and travel details from the main dashboard.
          </Text>

          <Pressable
            onPress={handleSave}
            disabled={saving}
            className={`mt-6 py-3.5 rounded-xl items-center ${saving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FEFEFE" />
            ) : (
              <Text className="text-base font-bold text-cream">Create Athlete</Text>
            )}
          </Pressable>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
