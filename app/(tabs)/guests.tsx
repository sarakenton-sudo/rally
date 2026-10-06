import { inviteGuestToApp } from '@/lib/fanInvite';
import { useState } from 'react';
import { View, Text, FlatList, Pressable, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useIconColors } from '@/lib/colors';
import GuestCard, { type GuestWithFan } from '@/components/GuestCard';
import { showToast } from '@/components/Toast';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useGuestStore } from '@/stores/useGuestStore';
import { useDataRefresh } from '@/providers/DataProvider';
import ReferFriend from '@/components/ReferFriend';

export default function GuestsScreen() {
  const ic = useIconColors();
  const guests = useGuestStore((s) => s.guests);
  const { refresh, isRefreshing } = useDataRefresh();

  const athletes = useSeasonStore((s) => s.athletes);
  const [inviting, setInviting] = useState<string | null>(null);
  const onApp = (guests as GuestWithFan[]).filter((g) => g.invite_status === 'joined').length;

  // Guests become fans in the app (00086): share the link; email it too if we have an address.
  const invite = async (g: GuestWithFan) => {
    setInviting(g.id);
    await inviteGuestToApp(g, athletes.find((a) => a.id === g.athlete_id)?.first_name ?? 'our athlete');
    setInviting(null);
    refresh();
  };

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
              {onApp > 0 ? ` · ${onApp} on the app` : ''}
            </Text>
            <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mt-3 flex-row items-start">
              <Ionicons name="information-circle" size={18} color="#3B82B0" />
              <Text className="text-sm text-rally-700 dark:text-rally-300 ml-2 flex-1 leading-5">
                Guests lets you easily share and automate key information — upcoming tournaments, locations,
                streaming links and ticket info — with grandparents, family and other fans.
                {'\n\n'}Invite guests to the free RallyHUB app — they'll have every tournament, location and stream link in one place, without group texts.
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }: { item: GuestWithFan }) => (
          <GuestCard
            guest={item}
            inviting={inviting === item.id}
            onInvite={() => invite(item)}
            onPress={() => router.push({ pathname: '/guest/add', params: { editId: item.id } })}
          />
        )}
        ListFooterComponent={() => <ReferFriend />}
        ListEmptyComponent={
          <View className="items-center justify-center py-16">
            <Ionicons name="people-outline" size={48} color={ic.placeholder} />
            <Text className="text-lg font-semibold text-bark dark:text-cream mt-4">
              No guests added yet
            </Text>
            <Text className="text-sm text-stone dark:text-parchment mt-1 text-center px-8">
              Stop being the family group chat. Add anyone who wants to follow the season — they'll get locations, streaming links, and ticket info without you lifting a finger.
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
