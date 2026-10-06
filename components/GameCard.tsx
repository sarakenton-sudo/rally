import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { gameTitle, formatGameTime, type ScheduleGame } from '@/lib/teamEvents';

const GAME_COLOR = '#0f766e'; // games/team events (tournaments are sage, lessons by kind)

/** A school/club game or team event in a schedule timeline. Tap → game detail. */
export default function GameCard({ game, athleteName, teamName }: { game: ScheduleGame; athleteName?: string; teamName?: string }) {
  const d = new Date(`${game.date}T12:00:00`);
  const time = formatGameTime(game.time);
  const where = game.venue_name || game.address;
  const isGame = game.event_type === 'game';
  return (
    <Pressable
      onPress={() => router.push(`/game/${game.id}`)}
      className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 mb-3 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
      style={{ borderLeftWidth: 4, borderLeftColor: GAME_COLOR, shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 }}
      accessibilityLabel={`${gameTitle(game)}${athleteName ? `, ${athleteName}` : ''}, ${d.toDateString()}${time ? ` ${time}` : ''}`}
    >
      <View className="w-11 h-11 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: GAME_COLOR + '15' }}>
        <Text className="text-[10px] font-bold uppercase" style={{ color: GAME_COLOR }}>{d.toLocaleDateString(undefined, { month: 'short' })}</Text>
        <Text className="text-base font-bold -mt-0.5" style={{ color: GAME_COLOR }}>{d.getDate()}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-bark dark:text-cream" numberOfLines={1}>
          {gameTitle(game)}{athleteName ? ` · ${athleteName}` : ''}
        </Text>
        <Text className="text-xs text-stone dark:text-parchment mt-0.5" numberOfLines={1}>
          {d.toLocaleDateString(undefined, { weekday: 'short' })}{time ? ` ${time}` : ''}{where ? ` · ${where}` : ''}{teamName ? ` · ${teamName}` : ''}
        </Text>
      </View>
      <View className="px-2 py-1 rounded-md ml-2" style={{ backgroundColor: GAME_COLOR + '18' }}>
        <Text className="text-[10px] font-bold" style={{ color: GAME_COLOR }}>{isGame ? 'GAME' : game.event_type === 'practice' ? 'PRACTICE' : 'EVENT'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#8FA8BF" style={{ marginLeft: 6 }} />
    </Pressable>
  );
}
