import { useState, useMemo } from 'react';
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

  const hasMultipleAthletes = athletes.length > 1;

  // Figure out which athlete is currently active
  const activeSeason = seasons.find((s) => s.id === activeSeasonId);
  const activeAthleteId = activeSeason?.athlete_id || athletes[0]?.id || '';

  // Does any athlete have multiple seasons?
  const athleteSeasonsMap = useMemo(() => {
    const map: Record<string, typeof seasons> = {};
    for (const s of seasons) {
      if (!map[s.athlete_id]) map[s.athlete_id] = [];
      map[s.athlete_id].push(s);
    }
    return map;
  }, [seasons]);

  const activeAthleteSeasons = athleteSeasonsMap[activeAthleteId] || [];
  const activeAthleteHasMultipleSeasons = activeAthleteSeasons.length > 1;

  const handleSwitch = async (seasonId: string) => {
    tapLight();
    setActiveSeasonId(seasonId);
    if (adminConfig) {
      const updated = { ...adminConfig, active_season_id: seasonId };
      setAdminConfig(updated);
      await updateAdminConfig(adminConfig.id, { active_season_id: seasonId });
    }
  };

  const handleSelectAthlete = (athleteId: string) => {
    const athleteSeasons = athleteSeasonsMap[athleteId] || [];
    if (athleteSeasons.length === 1) {
      // Only one season — just switch to it
      handleSwitch(athleteSeasons[0].id);
    } else if (athleteSeasons.length > 1) {
      // Multiple seasons — switch to most recent, secondary row will appear
      const sorted = [...athleteSeasons].sort((a, b) => b.season_year.localeCompare(a.season_year));
      // If we're already on this athlete, don't switch
      if (activeAthleteId !== athleteId) {
        handleSwitch(sorted[0].id);
      }
    }
  };

  // Case 1: Single athlete, multiple seasons → season chips only
  if (!hasMultipleAthletes) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6, gap: 8 }}
      >
        {[...seasons]
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
                  {season.team_name} · {season.season_year}
                </Text>
              </Pressable>
            );
          })}
      </ScrollView>
    );
  }

  // Case 2: Multiple athletes
  return (
    <View>
      {/* Row 1: Athlete chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 6, gap: 8 }}
      >
        {athletes.map((athlete) => {
          const isActive = activeAthleteId === athlete.id;
          const avatarColor = athlete.avatar_color ||
            AVATAR_COLORS[athlete.first_name.charCodeAt(0) % AVATAR_COLORS.length];

          return (
            <Pressable
              key={athlete.id}
              onPress={() => handleSelectAthlete(athlete.id)}
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
                {athlete.first_name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Row 2: Season chips — only if selected athlete has multiple seasons */}
      {activeAthleteHasMultipleSeasons && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 6, gap: 8 }}
        >
          {[...activeAthleteSeasons]
            .sort((a, b) => b.season_year.localeCompare(a.season_year))
            .map((season) => {
              const isActive = season.id === activeSeasonId;
              return (
                <Pressable
                  key={season.id}
                  onPress={() => handleSwitch(season.id)}
                  style={isActive ? {
                    backgroundColor: 'rgba(59,130,176,0.3)',
                    borderColor: 'rgba(59,130,176,0.5)',
                    borderWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 9999,
                  } : {
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 9999,
                  }}
                >
                  <Text style={{
                    fontSize: 11,
                    fontFamily: 'NunitoSans-SemiBold',
                    color: isActive ? '#7DBDD9' : 'rgba(255,255,255,0.45)',
                  }}>
                    {season.team_name} · {season.season_year}
                  </Text>
                </Pressable>
              );
            })}
        </ScrollView>
      )}
    </View>
  );
}
