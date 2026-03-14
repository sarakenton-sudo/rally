import { View, Text, ScrollView, RefreshControl, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import USAVProfileCard from '@/components/USAVProfileCard';
import HubSectionHeader from '@/components/HubSectionHeader';
import HubSettingsRow from '@/components/HubSettingsRow';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import { openDeepLink } from '@/lib/deepLink';

export default function AthleteScreen() {
  const athletes = useSeasonStore((s) => s.athletes);
  const seasons = useSeasonStore((s) => s.seasons);
  const tournaments = useSeasonStore((s) => s.tournaments);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const setActiveSeasonId = useSeasonStore((s) => s.setActiveSeasonId);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const usavProfiles = useSeasonStore((s) => s.usavProfiles);
  const ic = useIconColors();
  const { refresh, isRefreshing } = useDataRefresh();

  const activeSeason = seasons.find((s) => s.id === activeSeasonId);
  const activeAthlete = athletes.find((a) => a.id === activeSeason?.athlete_id);
  const externalLinks = adminConfig?.external_links ?? [];

  // Athlete-scoped links
  const athleteLinks = externalLinks.filter((l) => {
    if (l.scope === 'athlete') return true;
    if (!l.scope) {
      const lower = l.label.toLowerCase();
      return ['sportsrecruits', 'university athlete', 'hudl'].some((k) => lower.includes(k));
    }
    return false;
  });

  // Group seasons by athlete
  const athleteSeasons = athletes.map((athlete) => ({
    athlete,
    seasons: seasons
      .filter((s) => s.athlete_id === athlete.id)
      .sort((a, b) => b.season_year.localeCompare(a.season_year)),
  }));

  // USAV profiles for active athlete
  const athleteUsavProfiles = usavProfiles.filter((p) => p.athlete_id === activeAthlete?.id);

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

  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3B82B0" />}
      >
        <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold">
          {activeAthlete?.first_name}{activeAthlete?.last_name ? ` ${activeAthlete.last_name}` : ''}
        </Text>
        <Text className="text-sm text-stone dark:text-parchment mt-1 mb-6">
          {seasons.filter((s) => s.athlete_id === activeAthlete?.id).length} season{seasons.filter((s) => s.athlete_id === activeAthlete?.id).length !== 1 ? 's' : ''}
        </Text>

        {/* ============================================================ */}
        {/* SEASONS — grouped by athlete */}
        {/* ============================================================ */}
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
        {/* SEASON SETTINGS — for active season */}
        {/* ============================================================ */}
        {activeSeason && (
          <>
            <View className="mt-4">
              <HubSectionHeader
                icon="settings"
                title={`${activeSeason.team_name} Settings`}
                iconColor={ic.muted}
              />
            </View>

            {/* Team Details */}
            <HubSettingsRow
              icon="information-circle"
              iconColor="#3B82B0"
              title="Team Details"
              subtitle={`${activeSeason.club_name ? activeSeason.club_name + ' · ' : ''}${activeSeason.season_year}`}
              onPress={() => router.push('/settings/team-details')}
            />

            {/* Schedule Import */}
            <HubSettingsRow
              icon="calendar"
              iconColor="#6A9E8A"
              title="Tournament Schedule Import"
              subtitle="Import from coach emails, copy/paste, or direct sync"
              onPress={() => router.push('/settings/schedule-import')}
            />

            {/* Default Stream Channel */}
            {activeSeason.default_stream_url ? (
              <Pressable
                className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900 active:opacity-80"
                style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
                onPress={() => router.push('/settings/streaming-hub')}
              >
                <View className="flex-row items-center">
                  <Ionicons name="play-circle" size={24} color="#dc2626" />
                  <View className="ml-3 flex-1">
                    <Text className="text-sm font-semibold text-bark dark:text-cream">
                      {activeSeason.default_streaming_platform ?? 'Stream'}
                    </Text>
                    <Text className="text-xs text-stone mt-0.5" numberOfLines={1}>
                      {activeSeason.default_stream_url}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
                </View>
              </Pressable>
            ) : (
              <HubSettingsRow
                icon="videocam"
                iconColor="#dc2626"
                title="Default Stream Channel"
                subtitle="YouTube, GameChanger, Baller.tv, or other"
                onPress={() => router.push('/settings/streaming-hub')}
              />
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* USAV MEMBERSHIP */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader
            icon="shield-checkmark"
            title="USAV Membership"
            iconColor="#dc2626"
            action={{ label: 'Add', onPress: () => router.push('/profile/add-usav') }}
          />
        </View>

        {athleteUsavProfiles.length > 0 ? (
          athleteUsavProfiles.map((profile) => (
            <View key={profile.id} className="mb-3">
              <USAVProfileCard
                profile={profile}
                onPress={() => router.push({ pathname: '/profile/add-usav', params: { editId: profile.id } })}
              />
            </View>
          ))
        ) : (
          <Pressable
            className="bg-red-50 dark:bg-red-900/20 rounded-xl p-5 mb-3 border border-dashed border-red-200 dark:border-red-800 items-center active:opacity-80"
            onPress={() => router.push('/profile/add-usav')}
          >
            <Ionicons name="shield-outline" size={28} color="#dc2626" />
            <Text className="text-sm font-semibold text-red-700 dark:text-red-300 mt-2">
              Add USAV Membership
            </Text>
            <Text className="text-xs text-red-500 dark:text-red-400 mt-1 text-center">
              Quick check-in at tournaments with your member ID
            </Text>
          </Pressable>
        )}

        {/* ============================================================ */}
        {/* ATHLETE LINKS */}
        {/* ============================================================ */}
        {athleteLinks.length > 0 && (
          <>
            <View className="mt-4">
              <HubSectionHeader
                icon="link"
                title="Athlete Links"
                iconColor={ic.muted}
              />
            </View>
            <View className="flex-row flex-wrap gap-3 mb-4">
              {athleteLinks.map((link, i) => {
                const originalIndex = externalLinks.indexOf(link);
                return (
                  <Pressable
                    key={`${link.label}-${i}`}
                    className={`rounded-xl p-4 items-center justify-center border active:opacity-70 ${
                      link.url
                        ? 'bg-warm-white dark:bg-bark-light border-parchment dark:border-rally-900'
                        : 'bg-cream dark:bg-bark-light/50 border-dashed border-parchment dark:border-rally-900'
                    }`}
                    style={{ width: '47%', shadowColor: link.url ? '#1E3A5F' : 'transparent', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: link.url ? 2 : 0 }}
                    onPress={() => link.url ? openDeepLink(link) : router.push({ pathname: '/profile/edit-link', params: { index: String(originalIndex) } })}
                  >
                    <Ionicons
                      name={link.icon_name as keyof typeof Ionicons.glyphMap}
                      size={28}
                      color={link.url ? '#3B82B0' : ic.placeholder}
                    />
                    <Text className={`text-sm font-medium mt-2 text-center ${link.url ? 'text-bark dark:text-parchment' : 'text-stone'}`}>
                      {link.label}
                    </Text>
                    {!link.url && (
                      <Text className="text-xs text-parchment mt-0.5">Tap to set up</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

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
