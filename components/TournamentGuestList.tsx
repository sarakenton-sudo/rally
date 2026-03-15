import { useState } from 'react';
import { View, Text, Pressable, Alert, ActionSheetIOS, Platform, Modal, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useGuestStore } from '@/stores/useGuestStore';
import { useSeasonStore } from '@/stores/useSeasonStore';
import type { Guest, Tournament } from '@/types/database';

interface TournamentGuestListProps {
  tournament: Tournament;
}

export default function TournamentGuestList({ tournament }: TournamentGuestListProps) {
  const guests = useGuestStore((s) => s.guests);
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const activeSeason = seasons.find((s) => s.id === activeSeasonId);

  const [showActionMenu, setShowActionMenu] = useState<Guest | null>(null);

  // --- Build SMS messages ---
  const buildInPersonSMS = (): string => {
    const lines: string[] = [`${tournament.name}`];
    if (tournament.ticket_link) {
      const teamCode = activeSeason?.team_code;
      lines.push('');
      lines.push(`Tickets: ${tournament.ticket_link}`);
      if (teamCode) lines.push(`Team Code: ${teamCode}`);
    }
    const venue = tournament.venues.find((v) => v.is_confirmed) ?? tournament.venues[0];
    if (venue?.address) {
      lines.push('');
      lines.push(`Venue: ${venue.label || tournament.location_city}`);
      lines.push(`Directions: https://maps.google.com/?q=${encodeURIComponent(venue.address)}`);
    } else if (tournament.location_city) {
      lines.push('');
      lines.push(`Location: ${tournament.location_city}`);
    }
    return lines.join('\n');
  };

  const buildStreamingSMS = (): string => {
    const lines: string[] = [`${tournament.name}`];
    if (tournament.streaming_links.length > 0) {
      lines.push('');
      lines.push(`Watch: ${tournament.streaming_links[0].url}`);
    } else if (activeSeason?.default_stream_url) {
      lines.push('');
      lines.push(`Watch: ${activeSeason.default_stream_url}`);
    }
    if (tournament.schedule_link) {
      lines.push('');
      lines.push(`Schedule: ${tournament.schedule_link}`);
    }
    return lines.join('\n');
  };

  const sendSMS = (guest: Guest, message: string) => {
    if (!guest.phone) {
      if (Platform.OS === 'web') {
        window.alert(`No phone number for ${guest.name}. Edit their profile to add one.`);
      } else {
        Alert.alert('No Phone', `No phone number for ${guest.name}. Edit their profile to add one.`);
      }
      return;
    }
    const encoded = encodeURIComponent(message);
    const smsUrl = Platform.OS === 'ios'
      ? `sms:${guest.phone}&body=${encoded}`
      : `sms:${guest.phone}?body=${encoded}`;
    if (Platform.OS === 'web') {
      window.open(smsUrl, '_blank');
    } else {
      Linking.openURL(smsUrl);
    }
  };

  const handleGuestPress = (guest: Guest) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Send In-Person Details', 'Send Streaming Details', 'Edit Guest', 'Cancel'], cancelButtonIndex: 3, title: guest.name },
        (index) => {
          if (index === 0) sendSMS(guest, buildInPersonSMS());
          if (index === 1) sendSMS(guest, buildStreamingSMS());
          if (index === 2) router.push({ pathname: '/guest/add', params: { editId: guest.id } });
        }
      );
    } else {
      setShowActionMenu(guest);
    }
  };

  // --- Empty state ---
  if (guests.length === 0) {
    return (
      <View>
        <Pressable
          className="bg-white/70 dark:bg-bark-light rounded-xl p-4 border border-dashed border-pink-200 dark:border-pink-900 items-center active:opacity-80"
          onPress={() => router.push('/guest/add')}
        >
          <Ionicons name="person-add-outline" size={22} color="#ec4899" />
          <Text className="text-sm text-stone mt-1">Add your first guest</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {/* All guests */}
      {guests.map((guest) => (
        <Pressable
          key={guest.id}
          className="bg-white/70 dark:bg-bark-light rounded-xl p-3.5 mb-2 border border-pink-100 dark:border-pink-900 flex-row items-center active:opacity-80"
          onPress={() => handleGuestPress(guest)}
        >
          {/* Avatar */}
          <View className="w-9 h-9 rounded-full bg-pink-100 dark:bg-pink-900/30 items-center justify-center mr-3">
            <Text className="text-sm font-bold text-pink-600">
              {guest.name.charAt(0)}
            </Text>
          </View>

          {/* Name + relationship */}
          <View className="flex-1">
            <Text className="text-sm font-semibold text-bark dark:text-cream">
              {guest.name}
            </Text>
            <Text className="text-xs text-stone mt-0.5">{guest.relationship}</Text>
          </View>

          {/* SMS hint */}
          <Ionicons name="chatbubble-outline" size={16} color="#ec4899" />
          <Ionicons name="chevron-forward" size={14} color="#8FA8BF" style={{ marginLeft: 4 }} />
        </Pressable>
      ))}

      {/* Add new guest */}
      <Pressable
        className="bg-white/70 dark:bg-bark-light rounded-xl p-3.5 mb-2 border border-dashed border-pink-200 dark:border-pink-900 flex-row items-center justify-center active:opacity-80"
        onPress={() => router.push('/guest/add')}
      >
        <Ionicons name="person-add-outline" size={16} color="#ec4899" />
        <Text className="text-sm font-semibold text-pink-700 ml-2">Add Guest</Text>
      </Pressable>

      {/* Guest action modal (Android + Web) */}
      <Modal visible={!!showActionMenu} transparent animationType="fade" onRequestClose={() => setShowActionMenu(null)}>
        <Pressable className="flex-1 bg-black/50 justify-center items-center" onPress={() => setShowActionMenu(null)}>
          <View className="bg-warm-white dark:bg-bark-light rounded-2xl w-72 overflow-hidden">
            <Text className="text-base font-bold text-bark dark:text-cream p-4 pb-2">{showActionMenu?.name}</Text>
            <Pressable
              className="px-4 py-3.5 border-t border-parchment dark:border-rally-900 flex-row items-center active:bg-pink-50"
              onPress={() => {
                if (showActionMenu) sendSMS(showActionMenu, buildInPersonSMS());
                setShowActionMenu(null);
              }}
            >
              <Ionicons name="location" size={18} color="#ec4899" />
              <View className="ml-3">
                <Text className="text-sm font-semibold text-bark dark:text-cream">Send In-Person Details</Text>
                <Text className="text-xs text-stone mt-0.5">Tickets, team code, venue directions</Text>
              </View>
            </Pressable>
            <Pressable
              className="px-4 py-3.5 border-t border-parchment dark:border-rally-900 flex-row items-center active:bg-pink-50"
              onPress={() => {
                if (showActionMenu) sendSMS(showActionMenu, buildStreamingSMS());
                setShowActionMenu(null);
              }}
            >
              <Ionicons name="videocam" size={18} color="#ec4899" />
              <View className="ml-3">
                <Text className="text-sm font-semibold text-bark dark:text-cream">Send Streaming Details</Text>
                <Text className="text-xs text-stone mt-0.5">Stream link, schedule</Text>
              </View>
            </Pressable>
            <Pressable
              className="px-4 py-3.5 border-t border-parchment dark:border-rally-900 flex-row items-center active:bg-pink-50"
              onPress={() => {
                if (showActionMenu) router.push({ pathname: '/guest/add', params: { editId: showActionMenu.id } });
                setShowActionMenu(null);
              }}
            >
              <Ionicons name="create-outline" size={18} color="#8FA8BF" />
              <View className="ml-3">
                <Text className="text-sm font-semibold text-bark dark:text-cream">Edit Guest</Text>
              </View>
            </Pressable>
            <Pressable
              className="px-4 py-3 border-t border-parchment dark:border-rally-900 items-center active:bg-pink-50"
              onPress={() => setShowActionMenu(null)}
            >
              <Text className="text-sm font-semibold text-stone">Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
