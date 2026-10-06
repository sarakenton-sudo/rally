import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import { showToast } from '@/components/Toast';
import { deleteSeasonAndData, seasonDeleteWarning } from '@/lib/seasonDelete';
import type { StreamingPlatform } from '@/types/database';

const STREAM_PLATFORMS: StreamingPlatform[] = ['YouTube', 'GameChanger', 'Baller.tv', 'Other'];

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
  // Default live stream (was its own screen, settings/streaming-hub).
  const [platform, setPlatform] = useState<StreamingPlatform | null>(activeSeason?.default_streaming_platform ?? null);
  const [streamUrl, setStreamUrl] = useState(activeSeason?.default_stream_url ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tournamentCount = useSeasonStore((s) => s.tournaments.filter((t) => t.season_id === activeSeason?.id).length);

  const removeSeason = async () => {
    if (!activeSeason) return;
    setDeleting(true);
    const { error: e } = await deleteSeasonAndData(activeSeason.id);
    setDeleting(false);
    if (e) { setError(e); setConfirmDelete(false); return; }
    showToast(`${activeSeason.team_name} deleted`);
    router.back();
  };

  const handleSave = async () => {
    if (!activeSeason || !adminConfig) return;
    setError(null);
    if (!teamName.trim()) { setError('Team name is required.'); return; }
    const url = streamUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) { setError('The stream link should start with https://'); return; }

    setIsSaving(true);

    const seasonUpdates = {
      team_name: teamName.trim(),
      season_year: seasonYear.trim(),
      team_code: teamCode.trim() || null,
      default_streaming_platform: url ? platform ?? 'Other' : null,
      default_stream_url: url || null,
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
        if (seasonError) { setError(`Couldn't save: ${seasonError.message}`); return; }

        const { error: adminError } = await updateAdminConfig(adminConfig.id, adminUpdates);
        if (adminError) { setError(`Couldn't save: ${adminError.message}`); return; }
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

          {/* Live stream */}
          <View className="mt-4 mb-2 flex-row items-center">
            <Ionicons name="tv-outline" size={16} color="#dc2626" />
            <Text className="text-sm font-bold text-bark dark:text-cream ml-1.5">Live stream</Text>
          </View>
          <Text className="text-xs text-stone dark:text-parchment mb-3">
            Your team's usual channel. It shows as Watch Live on the Schedule and on any tournament without its own stream link.
          </Text>
          <View className="flex-row flex-wrap mb-3" style={{ gap: 8 }}>
            {STREAM_PLATFORMS.map((p) => {
              const on = platform === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPlatform(on ? null : p)}
                  className={`rounded-xl border ${on ? 'bg-rally-600 border-rally-600' : 'bg-cream dark:bg-bark-light border-parchment dark:border-rally-900'}`}
                  style={{ paddingHorizontal: 14, paddingVertical: 8 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text className={`text-sm font-semibold ${on ? 'text-cream' : 'text-bark dark:text-cream'}`}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
          <FormField label="Channel or stream link" value={streamUrl} onChangeText={setStreamUrl} placeholder="https://youtube.com/@yourclub" keyboardType="url" autoCapitalize="none" />

          {error ? (
            <View className="rounded-xl p-3 mt-2" style={{ backgroundColor: '#fee2e2' }}>
              <Text className="text-sm text-red-700">{error}</Text>
            </View>
          ) : null}

          {/* Delete season: second tap confirms */}
          {activeSeason ? (
            <View className="mt-8 pt-4 border-t border-parchment dark:border-rally-900">
              {confirmDelete ? (
                <View className="rounded-xl p-3" style={{ backgroundColor: '#fee2e2' }}>
                  <Text className="text-sm font-semibold text-red-800">Delete {activeSeason.team_name} ({activeSeason.season_year})?</Text>
                  <Text className="text-xs text-red-700 mt-1">{seasonDeleteWarning(tournamentCount)}</Text>
                  <View className="flex-row mt-3" style={{ gap: 8 }}>
                    <Pressable onPress={() => setConfirmDelete(false)} className="flex-1 rounded-lg py-2.5 items-center bg-white active:opacity-70">
                      <Text className="text-sm font-semibold text-bark">Keep it</Text>
                    </Pressable>
                    <Pressable onPress={removeSeason} disabled={deleting} className="flex-1 rounded-lg py-2.5 items-center active:opacity-80" style={{ backgroundColor: '#DC2626' }} accessibilityLabel="Confirm delete season">
                      <Text className="text-sm font-bold text-white">{deleting ? 'Deleting…' : 'Delete season'}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable onPress={() => setConfirmDelete(true)} className="flex-row items-center justify-center py-3 active:opacity-70" accessibilityLabel="Delete this season">
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text className="text-sm font-semibold text-red-600 ml-1.5">Delete this season</Text>
                </Pressable>
              )}
            </View>
          ) : null}

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
