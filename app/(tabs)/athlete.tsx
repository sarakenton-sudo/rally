import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import HubSectionHeader from '@/components/HubSectionHeader';
import HubSettingsRow from '@/components/HubSettingsRow';
import AthleteCredentialCard from '@/components/AthleteCredentialCard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';

// Default athlete-scoped services — always shown even if not yet configured
const ATHLETE_SERVICES = ['SportsRecruits', 'Hudl', 'University Athlete', 'Instagram'];

export default function AthleteScreen() {
  const athletes = useSeasonStore((s) => s.athletes);
  const seasons = useSeasonStore((s) => s.seasons);
  const tournaments = useSeasonStore((s) => s.tournaments);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const setActiveSeasonId = useSeasonStore((s) => s.setActiveSeasonId);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const ic = useIconColors();
  const { refresh, isRefreshing } = useDataRefresh();

  const activeSeason = seasons.find((s) => s.id === activeSeasonId);
  const activeAthlete = athletes.find((a) => a.id === activeSeason?.athlete_id);
  const externalLinks = adminConfig?.external_links ?? [];

  // Build credential cards: merge saved links with default services
  const credentialCards = ATHLETE_SERVICES.map((serviceName) => {
    const lower = serviceName.toLowerCase();
    const existing = externalLinks.find((l) => l.label.toLowerCase() === lower);
    const originalIndex = existing ? externalLinks.indexOf(existing) : -1;
    return {
      label: existing?.label ?? serviceName,
      url: existing?.url ?? '',
      username: existing?.username ?? null,
      password: existing?.password ?? null,
      originalIndex,
    };
  });

  // Also include any extra athlete-scoped links not in the default list
  const extraLinks = externalLinks.filter((l) => {
    if (l.scope !== 'athlete') {
      const lower = l.label.toLowerCase();
      if (!['sportsrecruits', 'university athlete', 'hudl', 'instagram'].some((k) => lower.includes(k))) return false;
    }
    const lower = l.label.toLowerCase();
    return !ATHLETE_SERVICES.some((s) => s.toLowerCase() === lower);
  });

  extraLinks.forEach((link) => {
    credentialCards.push({
      label: link.label,
      url: link.url,
      username: link.username,
      password: link.password,
      originalIndex: externalLinks.indexOf(link),
    });
  });

  // Group seasons by athlete
  const athleteSeasons = athletes.map((athlete) => ({
    athlete,
    seasons: seasons
      .filter((s) => s.athlete_id === athlete.id)
      .sort((a, b) => b.season_year.localeCompare(a.season_year)),
  }));

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
      // Create new link with this label pre-filled
      router.push({ pathname: '/profile/edit-link', params: { newLabel: label } });
    }
  };

  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3B82B0" />}
      >
        {/* Athlete name + edit */}
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold">
            {activeAthlete?.first_name}{activeAthlete?.last_name ? ` ${activeAthlete.last_name}` : ''}
          </Text>
          {activeAthlete && (
            <Pressable
              className="p-2 active:opacity-60"
              onPress={() => router.push({ pathname: '/settings/edit-athlete', params: { athleteId: activeAthlete.id } })}
            >
              <Ionicons name="pencil" size={18} color={ic.muted} />
            </Pressable>
          )}
        </View>
        <Text className="text-sm text-stone dark:text-parchment mb-6">
          {seasons.filter((s) => s.athlete_id === activeAthlete?.id).length} season{seasons.filter((s) => s.athlete_id === activeAthlete?.id).length !== 1 ? 's' : ''}
        </Text>

        {/* ============================================================ */}
        {/* LOGINS & CREDENTIALS */}
        {/* ============================================================ */}
        <HubSectionHeader
          icon="key"
          title="Logins & Credentials"
          iconColor="#3B82B0"
        />

        {credentialCards.map((card) => (
          <AthleteCredentialCard
            key={card.label}
            label={card.label}
            url={card.url}
            username={card.username}
            password={card.password}
            onEdit={() => handleEditLink(card.originalIndex, card.label)}
          />
        ))}

        {/* ============================================================ */}
        {/* USAV MEMBERSHIP — inline as a credential row */}
        {/* ============================================================ */}
        <HubSettingsRow
          icon="shield-checkmark"
          iconColor="#dc2626"
          title="USAV Membership"
          subtitle="Member ID for tournament check-in"
          onPress={() => router.push('/profile/add-usav')}
        />

        {/* ============================================================ */}
        {/* SEASONS — grouped by athlete */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader
            icon="calendar"
            title="Seasons"
            iconColor={ic.muted}
          />
        </View>

        {athleteSeasons.map(({ athlete, seasons: athleteSeasonList }) => (
          <View key={athlete.id} className="mb-4">
            {/* Athlete header — only if multiple athletes */}
            {athletes.length > 1 && (
              <View className="flex-row items-center mb-3">
                <Ionicons name="person-circle" size={20} color="#3B82B0" />
                <Text className="text-base font-bold text-bark dark:text-cream ml-2">
                  {athlete.first_name}{athlete.last_name ? ` ${athlete.last_name}` : ''}
                </Text>
              </View>
            )}

            {/* Season cards */}
            {athleteSeasonList.map((season) => {
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

            {/* Add Season for this athlete */}
            <Pressable
              className="rounded-xl p-3 mb-2 border border-dashed border-parchment dark:border-rally-900 flex-row items-center justify-center active:opacity-70"
              onPress={() => router.push({ pathname: '/settings/add-season', params: { athleteId: athlete.id } })}
            >
              <Ionicons name="add" size={16} color="#3B82B0" />
              <Text className="text-sm font-semibold text-rally-600 ml-2">Add Season</Text>
            </Pressable>
          </View>
        ))}

        {/* ============================================================ */}
        {/* ADD ATHLETE — secondary action at bottom */}
        {/* ============================================================ */}
        <View className="mt-4">
          <HubSettingsRow
            icon="person-add"
            iconColor="#6A9E8A"
            title="Add Another Athlete"
            subtitle="Manage a second player with their own seasons"
            onPress={() => router.push('/settings/add-athlete')}
          />
        </View>
      </ScrollView>
    </View>
  );
}
