import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useIconColors } from '@/lib/colors';

export default function AthleteScreen() {
  const athletes = useSeasonStore((s) => s.athletes);
  const seasons = useSeasonStore((s) => s.seasons);
  const usavProfiles = useSeasonStore((s) => s.usavProfiles);
  const ic = useIconColors();
  const { refresh, isRefreshing } = useDataRefresh();

  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3B82B0" />}
      >
        <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold mb-1">
          Athletes
        </Text>
        <Text className="text-sm text-stone dark:text-parchment mb-6">
          {athletes.length} athlete{athletes.length !== 1 ? 's' : ''}
        </Text>

        {athletes.map((athlete) => {
          const athleteSeasons = seasons.filter((s) => s.athlete_id === athlete.id);
          const activeSeason = athleteSeasons.sort((a, b) => b.season_year.localeCompare(a.season_year))[0];
          const hasUsav = usavProfiles.some((p) => p.athlete_id === athlete.id);

          return (
            <Pressable
              key={athlete.id}
              className="bg-warm-white dark:bg-bark-light rounded-2xl p-5 mb-3 border border-parchment dark:border-rally-900 active:opacity-80"
              style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
              onPress={() => router.push(`/athlete/${athlete.id}`)}
            >
              <View className="flex-row items-center">
                <View className="w-12 h-12 rounded-full bg-rally-100 dark:bg-rally-900/30 items-center justify-center mr-4">
                  <Text className="text-lg font-bold text-rally-600">
                    {athlete.first_name.charAt(0)}{athlete.last_name?.charAt(0) ?? ''}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-bark dark:text-cream">
                    {athlete.first_name}{athlete.last_name ? ` ${athlete.last_name}` : ''}
                  </Text>
                  {activeSeason && (
                    <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                      {activeSeason.team_name} · {activeSeason.season_year}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8FA8BF" />
              </View>

              {/* Quick stats */}
              <View className="flex-row items-center mt-3 gap-4 ml-16">
                <View className="flex-row items-center">
                  <Ionicons name="calendar-outline" size={12} color="#8FA8BF" />
                  <Text className="text-xs text-stone ml-1">
                    {athleteSeasons.length} season{athleteSeasons.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                {hasUsav && (
                  <View className="flex-row items-center">
                    <Ionicons name="shield-checkmark" size={12} color="#dc2626" />
                    <Text className="text-xs text-stone ml-1">USAV</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}

        {/* Add Athlete */}
        <Pressable
          className="rounded-2xl p-5 mb-3 border border-dashed border-parchment dark:border-rally-900 flex-row items-center justify-center active:opacity-70"
          onPress={() => router.push('/settings/add-athlete')}
        >
          <Ionicons name="person-add" size={20} color="#6A9E8A" />
          <Text className="text-sm font-semibold text-green-700 dark:text-green-400 ml-2">
            Add Another Athlete
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
