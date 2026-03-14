import { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { tapLight } from '@/lib/haptics';
import type { Athlete, Season } from '@/types/database';

export default function SeasonSwitcher() {
  const athletes = useSeasonStore((s) => s.athletes);
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setActiveSeasonId = useSeasonStore((s) => s.setActiveSeasonId);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const [open, setOpen] = useState(false);

  const activeSeason = seasons.find((s) => s.id === activeSeasonId);
  const activeAthlete = athletes.find((a) =>
    seasons.some((s) => s.id === activeSeasonId && s.athlete_id === a.id)
  );

  // Only show switcher if there are multiple options
  const hasMultiple = athletes.length > 1 || seasons.length > 1;
  if (!hasMultiple && !activeSeason) return null;

  // Group seasons by athlete
  const athleteSeasons = athletes.map((athlete) => ({
    athlete,
    seasons: seasons
      .filter((s) => s.athlete_id === athlete.id)
      .sort((a, b) => b.season_year.localeCompare(a.season_year)),
  }));

  const handleSwitch = async (seasonId: string) => {
    tapLight();
    setActiveSeasonId(seasonId);
    setOpen(false);

    // Persist to DB
    if (adminConfig) {
      const updated = { ...adminConfig, active_season_id: seasonId };
      setAdminConfig(updated);
      await updateAdminConfig(adminConfig.id, { active_season_id: seasonId });
    }
  };

  const label = activeAthlete && athletes.length > 1
    ? `${activeAthlete.first_name} • ${activeSeason?.team_name ?? ''}`
    : activeSeason?.team_name ?? '';

  // Single athlete, single season — just show label, no switcher
  if (!hasMultiple) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 }}>
        <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: 'rgba(255,255,255,0.6)' }}>
          {label}{activeSeason?.season_year ? ` — ${activeSeason.season_year}` : ''}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 6,
          paddingHorizontal: 12,
          gap: 6,
        }}
      >
        <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Bold', color: 'rgba(255,255,255,0.8)' }}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.5)" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#1E3A5F',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 12,
              paddingBottom: Platform.OS === 'ios' ? 40 : 24,
              maxHeight: '70%',
            }}
          >
            {/* Handle bar */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            </View>

            <Text style={{
              fontSize: 16, fontFamily: 'Nunito-Bold', color: '#FEFEFE',
              textAlign: 'center', marginBottom: 20,
            }}>
              Switch Athlete / Season
            </Text>

            <ScrollView style={{ paddingHorizontal: 20 }}>
              {athleteSeasons.map(({ athlete, seasons: athleteSeasonList }) => (
                <View key={athlete.id} style={{ marginBottom: 20 }}>
                  {/* Athlete header — only show if multiple athletes */}
                  {athletes.length > 1 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                      <Ionicons name="person-circle" size={22} color="#7DBDD9" />
                      <Text style={{ fontSize: 15, fontFamily: 'Nunito-Bold', color: '#FEFEFE' }}>
                        {athlete.first_name}{athlete.last_name ? ` ${athlete.last_name}` : ''}
                      </Text>
                    </View>
                  )}

                  {/* Season rows */}
                  {athleteSeasonList.map((season) => {
                    const isActive = season.id === activeSeasonId;
                    return (
                      <Pressable
                        key={season.id}
                        onPress={() => handleSwitch(season.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          borderRadius: 14,
                          marginBottom: 6,
                          backgroundColor: isActive ? 'rgba(59,130,176,0.2)' : 'rgba(255,255,255,0.05)',
                          borderWidth: isActive ? 1.5 : 1,
                          borderColor: isActive ? 'rgba(59,130,176,0.4)' : 'rgba(255,255,255,0.08)',
                        }}
                      >
                        {isActive && (
                          <Ionicons name="checkmark-circle" size={20} color="#7DBDD9" style={{ marginRight: 10 }} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{
                            fontSize: 14, fontFamily: 'NunitoSans-Bold',
                            color: isActive ? '#7DBDD9' : 'rgba(255,255,255,0.8)',
                          }}>
                            {season.team_name}
                          </Text>
                          <Text style={{
                            fontSize: 12, fontFamily: 'NunitoSans-Regular',
                            color: 'rgba(255,255,255,0.4)', marginTop: 2,
                          }}>
                            {season.club_name ? `${season.club_name} • ` : ''}{season.season_year}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}

                  {/* Add Season for this athlete */}
                  <Pressable
                    onPress={() => {
                      setOpen(false);
                      router.push({ pathname: '/settings/add-season', params: { athleteId: athlete.id } });
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      paddingVertical: 10, gap: 6,
                      borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.12)',
                      borderRadius: 14,
                    }}
                  >
                    <Ionicons name="add" size={16} color="rgba(255,255,255,0.4)" />
                    <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: 'rgba(255,255,255,0.4)' }}>
                      Add Season
                    </Text>
                  </Pressable>
                </View>
              ))}

              {/* Add Athlete */}
              <Pressable
                onPress={() => {
                  setOpen(false);
                  router.push('/settings/add-athlete');
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  paddingVertical: 12, gap: 8, marginBottom: 8,
                  backgroundColor: 'rgba(106,158,138,0.12)',
                  borderWidth: 1.5, borderColor: 'rgba(106,158,138,0.25)',
                  borderRadius: 14,
                }}
              >
                <Ionicons name="person-add" size={16} color="#6A9E8A" />
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Bold', color: '#6A9E8A' }}>
                  Add Athlete
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
