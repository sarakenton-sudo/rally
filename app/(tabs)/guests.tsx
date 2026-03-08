import { View, Text, FlatList, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useIconColors } from '@/lib/colors';
import GuestCard from '@/components/GuestCard';
import { useGuestStore } from '@/stores/useGuestStore';
import { useDataRefresh } from '@/providers/DataProvider';
import type { Guest } from '@/types/database';

export default function GuestsScreen() {
  const ic = useIconColors();
  const guests = useGuestStore((s) => s.guests);
  const { refresh, isRefreshing } = useDataRefresh();

  const autoInvited = guests.filter((g) => g.default_invited).length;

  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      <FlatList
        data={guests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        onRefresh={refresh}
        refreshing={isRefreshing}
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold">
              Guests
            </Text>
            <Text className="text-sm text-stone dark:text-parchment mt-1">
              {guests.length} guest{guests.length !== 1 ? 's' : ''}
              {autoInvited > 0 ? ` · ${autoInvited} auto-invited` : ''}
            </Text>
          </View>
        }
        renderItem={({ item }: { item: Guest }) => (
          <GuestCard guest={item} onPress={() => router.push({ pathname: '/guest/add', params: { editId: item.id } })} />
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-16">
            <Ionicons name="people-outline" size={48} color={ic.placeholder} />
            <Text className="text-lg font-semibold text-bark dark:text-cream mt-4">
              No guests added yet
            </Text>
            <Text className="text-sm text-stone dark:text-parchment mt-1 text-center px-8">
              Add grandparents, family & friends. They'll get push/SMS notifications for tournaments — no app install required.
            </Text>
            <Pressable
              className="bg-rally-600 px-5 py-2.5 rounded-xl mt-6 active:opacity-80"
              onPress={() => router.push('/guest/add')}
            >
              <Text className="text-sm font-semibold text-cream">Add First Guest</Text>
            </Pressable>
          </View>
        }
      />

      {/* FAB */}
      {guests.length > 0 && (
        <Pressable
          className="absolute bottom-6 right-6 bg-rally-600 w-14 h-14 rounded-full items-center justify-center shadow-lg active:opacity-80"
          style={{ elevation: 4 }}
          onPress={() => router.push('/guest/add')}
        >
          <Ionicons name="person-add" size={22} color="#FEFEFE" />
        </Pressable>
      )}
    </View>
  );
}
