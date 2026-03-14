import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import HubSectionHeader from '@/components/HubSectionHeader';
import AthleteCredentialCard from '@/components/AthleteCredentialCard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';

const ATHLETE_SERVICES = ['SportsRecruits', 'Hudl', 'University Athlete', 'Instagram', 'USA Volleyball'];

export default function AthleteProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const athletes = useSeasonStore((s) => s.athletes);
  const seasons = useSeasonStore((s) => s.seasons);
  const tournaments = useSeasonStore((s) => s.tournaments);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const setActiveSeasonId = useSeasonStore((s) => s.setActiveSeasonId);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const ic = useIconColors();
  const { refresh, isRefreshing } = useDataRefresh();

  const athlete = athletes.find((a) => a.id === id);
  const athleteSeasons = seasons
    .filter((s) => s.athlete_id === id)
    .sort((a, b) => {
      // Active season first, then most recent
      if (a.id === activeSeasonId) return -1;
      if (b.id === activeSeasonId) return 1;
      return b.season_year.localeCompare(a.season_year);
    });
  const externalLinks = adminConfig?.external_links ?? [];

  // Build credential cards for this athlete
  const credentialCards = ATHLETE_SERVICES.map((serviceName) => {
    const lower = serviceName.toLowerCase();
    const existing = externalLinks.find(
      (l) => l.label.toLowerCase() === lower && (!l.athlete_id || l.athlete_id === id)
    );
    const originalIndex = existing ? externalLinks.indexOf(existing) : -1;
    return {
      label: existing?.label ?? serviceName,
      url: existing?.url ?? '',
      username: existing?.username ?? null,
      password: existing?.password ?? null,
      originalIndex,
    };
  });

  const handleSeasonTap = async (seasonId: string) => {
    tapLight();
    setActiveSeasonId(seasonId);
    if (adminConfig) {
      const updated = { ...adminConfig, active_season_id: seasonId };
      setAdminConfig(updated);
      await updateAdminConfig(adminConfig.id, { active_season_id: seasonId });
    }
    router.push('/(tabs)/season');
  };

  const handleEditLink = (originalIndex: number, label: string) => {
    if (originalIndex >= 0) {
      router.push({ pathname: '/profile/edit-link', params: { index: String(originalIndex) } });
    } else {
      router.push({ pathname: '/profile/edit-link', params: { newLabel: label } });
    }
  };

  if (!athlete) {
    return (
      <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark items-center justify-center" edges={['bottom']}>
        <Text className="text-base text-stone">Athlete not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      {/* Header bar */}
      <SafeAreaView edges={[]} style={{ backgroundColor: 'rgba(30,58,95,0.97)' }}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable onPress={() => router.back()} className="p-1 mr-3">
            <Ionicons name="arrow-back" size={22} color="#FEFEFE" />
          </Pressable>
          <Text className="text-lg font-bold text-cream flex-1">
            {athlete.first_name}{athlete.last_name ? ` ${athlete.last_name}` : ''}
          </Text>
          <Pressable
            className="p-1"
            onPress={() => router.push({ pathname: '/settings/edit-athlete', params: { athleteId: athlete.id } })}
          >
            <Ionicons name="pencil" size={18} color="rgba(255,255,255,0.65)" />
          </Pressable>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3B82B0" />}
      >
        {/* ============================================================ */}
        {/* SEASONS — at top, current/most recent first */}
        {/* ============================================================ */}
        <HubSectionHeader
          icon="calendar"
          title="Seasons"
          iconColor={ic.muted}
        />

        {athleteSeasons.map((season) => {
          const isActive = season.id === activeSeasonId;
          const tournamentCount = tournaments.filter((t) => t.season_id === season.id).length;
          const streamLabel = season.default_streaming_platform ?? null;

          return (
            <Pressable
              key={season.id}
              className={`rounded-xl p-4 mb-2 border active:opacity-80 ${
                isActive
                  ? 'bg-rally-50 dark:bg-rally-900/20 border-rally-400 dark:border-rally-600'
                  : 'bg-warm-white dark:bg-bark-light border-parchment dark:border-rally-900'
              }`}
              style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
              onPress={() => handleSeasonTap(season.id)}
            >
              <View className="flex-row items-center justify-between mb-1">
                <View className="flex-row items-center flex-1">
                  {isActive && (
                    <Ionicons name="checkmark-circle" size={18} color="#3B82B0" style={{ marginRight: 6 }} />
                  )}
                  <Text className={`text-sm font-bold ${isActive ? 'text-rally-700 dark:text-rally-300' : 'text-bark dark:text-cream'}`}>
                    {season.team_name}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
              </View>
              <Text className="text-xs text-stone dark:text-parchment">
                {season.club_name ? `${season.club_name} · ` : ''}{season.season_year}
              </Text>
              <View className="flex-row items-center mt-2 gap-4">
                <View className="flex-row items-center">
                  <Ionicons name="trophy-outline" size={12} color="#8FA8BF" />
                  <Text className="text-xs text-stone ml-1">{tournamentCount} tournament{tournamentCount !== 1 ? 's' : ''}</Text>
                </View>
                {season.team_code && (
                  <View className="flex-row items-center">
                    <Ionicons name="key-outline" size={12} color="#8FA8BF" />
                    <Text className="text-xs text-stone ml-1">{season.team_code}</Text>
                  </View>
                )}
                {streamLabel && (
                  <View className="flex-row items-center">
                    <Ionicons name="videocam-outline" size={12} color="#dc2626" />
                    <Text className="text-xs text-stone ml-1">{streamLabel}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}

        {/* Add Season */}
        <Pressable
          className="rounded-xl p-3 mb-2 border border-dashed border-parchment dark:border-rally-900 flex-row items-center justify-center active:opacity-70"
          onPress={() => router.push({ pathname: '/settings/add-season', params: { athleteId: athlete.id } })}
        >
          <Ionicons name="add" size={16} color="#3B82B0" />
          <Text className="text-sm font-semibold text-rally-600 ml-2">Add Season</Text>
        </Pressable>

        {/* ============================================================ */}
        {/* ACCOUNTS & LOGINS — compact tile grid */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader
            icon="key"
            title="Accounts & Logins"
            iconColor="#3B82B0"
          />
        </View>

        <View className="flex-row flex-wrap" style={{ gap: 10 }}>
          {credentialCards.map((card) => (
            <View key={card.label} style={{ width: '48%' }}>
              <AthleteCredentialCard
                label={card.label}
                url={card.url}
                username={card.username}
                password={card.password}
                onEdit={() => handleEditLink(card.originalIndex, card.label)}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
