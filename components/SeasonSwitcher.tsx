import { ScrollView, Pressable, Text, View } from 'react-native';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { tapLight } from '@/lib/haptics';

const AVATAR_COLORS = [
  '#3B82B0', '#7c3aed', '#6A9E8A', '#d97706', '#dc2626',
  '#0d9488', '#be185d', '#4f46e5', '#ca8a04', '#0891b2',
];

export default function SeasonSwitcher() {
  const athletes = useSeasonStore((s) => s.athletes);
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setActiveSeasonId = useSeasonStore((s) => s.setActiveSeasonId);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);

  const hasMultiple = athletes.length > 1 || seasons.length > 1;
  if (!hasMultiple) return null;

  const handleSwitch = async (seasonId: string) => {
    tapLight();
    setActiveSeasonId(seasonId);
    if (adminConfig) {
      const updated = { ...adminConfig, active_season_id: seasonId };
      setAdminConfig(updated);
      await updateAdminConfig(adminConfig.id, { active_season_id: seasonId });
    }
  };

  // Build chip list: group by athlete if multiple athletes
  const hasMultipleAthletes = athletes.length > 1;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6, gap: 8 }}
    >
      {hasMultipleAthletes ? (
        // Multiple athletes: show "Athlete • Team" chips
        seasons.map((season) => {
          const athlete = athletes.find((a) => a.id === season.athlete_id);
          const isActive = season.id === activeSeasonId;
          const avatarColor = athlete?.avatar_color ||
            AVATAR_COLORS[(athlete?.first_name || 'A').charCodeAt(0) % AVATAR_COLORS.length];

          return (
            <Pressable
              key={season.id}
              onPress={() => handleSwitch(season.id)}
              style={isActive ? {
                backgroundColor: avatarColor,
                borderColor: avatarColor,
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 9999,
              } : {
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderColor: 'rgba(255,255,255,0.15)',
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 9999,
              }}
            >
              <Text style={{
                fontSize: 12,
                fontFamily: 'NunitoSans-SemiBold',
                color: isActive ? '#FEFEFE' : 'rgba(255,255,255,0.6)',
              }}>
                {athlete?.first_name} · {season.team_name}
              </Text>
            </Pressable>
          );
        })
      ) : (
        // Single athlete, multiple seasons: show team name chips
        seasons
          .sort((a, b) => b.season_year.localeCompare(a.season_year))
          .map((season) => {
            const isActive = season.id === activeSeasonId;
            return (
              <Pressable
                key={season.id}
                onPress={() => handleSwitch(season.id)}
                style={isActive ? {
                  backgroundColor: '#3B82B0',
                  borderColor: '#3B82B0',
                  borderWidth: 1,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 9999,
                } : {
                  backgroundColor: 'rgba(255,255,255,0.08)',
                  borderColor: 'rgba(255,255,255,0.15)',
                  borderWidth: 1,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 9999,
                }}
              >
                <Text style={{
                  fontSize: 12,
                  fontFamily: 'NunitoSans-SemiBold',
                  color: isActive ? '#FEFEFE' : 'rgba(255,255,255,0.6)',
                }}>
                  {season.team_name}{season.club_name ? ` · ${season.season_year}` : ''}
                </Text>
              </Pressable>
            );
          })
      )}
    </ScrollView>
  );
}
