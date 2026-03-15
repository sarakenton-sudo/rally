import { useState } from 'react';
import { View, Text, Pressable, Alert, ActionSheetIOS, Platform, Modal, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useGuestStore } from '@/stores/useGuestStore';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { upsertTournamentGuest } from '@/hooks/useSupabaseData';
import { useAuth } from '@/providers/AuthProvider';
import type { TournamentGuest, Guest, Tournament } from '@/types/database';

interface TournamentGuestListProps {
  tournament: Tournament;
}

export default function TournamentGuestList({ tournament }: TournamentGuestListProps) {
  const guests = useGuestStore((s) => s.guests);
  const tournamentGuests = useGuestStore((s) => s.tournamentGuests);
  const addTournamentGuest = useGuestStore((s) => s.addTournamentGuest);
  const { user } = useAuth();
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const activeSeason = seasons.find((s) => s.id === activeSeasonId);

  const [showInviteMenu, setShowInviteMenu] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState<Guest | null>(null);

  const tournamentId = tournament.id;

  const invitedGuests = tournamentGuests
    .filter((tg) => tg.tournament_id === tournamentId && tg.invited)
    .map((tg) => {
      const guest = guests.find((g) => g.id === tg.guest_id);
      return guest ? { ...tg, guest } : null;
    })
    .filter(Boolean) as (TournamentGuest & { guest: Guest })[];

  const uninvitedGuests = guests.filter(
    (g) => !tournamentGuests.some((tg) => tg.tournament_id === tournamentId && tg.guest_id === g.id)
  );

  // --- Build SMS messages ---
  const buildInPersonSMS = (): string => {
    const lines: string[] = [`${tournament.name}`];

    // Ticket link + team code
    if (tournament.ticket_link) {
      const teamCode = activeSeason?.team_code;
      lines.push('');
      lines.push(`Tickets: ${tournament.ticket_link}`);
      if (teamCode) lines.push(`Team Code: ${teamCode}`);
    }

    // Venue address as Google Maps link
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

    // Streaming link
    if (tournament.streaming_links.length > 0) {
      lines.push('');
      lines.push(`Watch: ${tournament.streaming_links[0].url}`);
    } else if (activeSeason?.default_stream_url) {
      lines.push('');
      lines.push(`Watch: ${activeSeason.default_stream_url}`);
    }

    // Schedule link
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

  // --- Guest tap actions ---
  const handleGuestPress = (guest: Guest) => {
    const options = ['Send In-Person Details', 'Send Streaming Details', 'Cancel'];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, title: guest.name },
        (index) => {
          if (index === 0) sendSMS(guest, buildInPersonSMS());
          if (index === 1) sendSMS(guest, buildStreamingSMS());
        }
      );
    } else {
      setShowActionMenu(guest);
    }
  };

  // --- Invite flow ---
  const handleInviteGuest = () => {
    if (guests.length === 0) {
      router.push('/guest/add');
      return;
    }
    if (uninvitedGuests.length === 0) {
      if (Platform.OS === 'web') {
        window.alert('All your guests are already invited to this tournament.');
      } else {
        Alert.alert('All invited', 'All your guests are already invited to this tournament.');
      }
      return;
    }

    if (Platform.OS === 'ios') {
      const options = [...uninvitedGuests.map((g) => g.name), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: options.length - 1, title: 'Invite a Guest' },
        async (index) => {
          if (index < uninvitedGuests.length) {
            await inviteGuest(uninvitedGuests[index]);
          }
        }
      );
    } else {
      setShowInviteMenu(true);
    }
  };

  const inviteGuest = async (guest: Guest) => {
    setShowInviteMenu(false);
    const tg: TournamentGuest = {
      tournament_id: tournamentId,
      guest_id: guest.id,
      invited: true,
      rsvp_status: 'pending',
      attending_in_person: true,
      ticket_purchased: false,
    };

    if (isSupabaseConfigured && user) {
      const { error } = await upsertTournamentGuest(tg);
      if (error) {
        if (Platform.OS === 'web') {
          window.alert(`Failed: ${error.message}`);
        } else {
          Alert.alert('Failed', error.message);
        }
        return;
      }
    }
    addTournamentGuest(tg);
    if (Platform.OS !== 'web') {
      Alert.alert('Invited', `${guest.name} has been invited.`);
    }
  };

  // --- Shared sub-components ---
  const InviteButton = () => (
    <View className="flex-row gap-2 mb-2">
      <Pressable
        className="flex-1 bg-white/70 dark:bg-bark-light rounded-xl p-3.5 border border-dashed border-pink-200 dark:border-pink-900 flex-row items-center justify-center active:opacity-80"
        onPress={handleInviteGuest}
      >
        <Ionicons name="person-add-outline" size={16} color="#ec4899" />
        <Text className="text-sm font-semibold text-pink-700 ml-2">Invite Guest</Text>
      </Pressable>
      <Pressable
        className="flex-1 bg-white/70 dark:bg-bark-light rounded-xl p-3.5 border border-dashed border-pink-200 dark:border-pink-900 flex-row items-center justify-center active:opacity-80"
        onPress={() => router.push({ pathname: '/guest/add', params: { tournamentId: tournament.id } })}
      >
        <Ionicons name="add-circle-outline" size={16} color="#ec4899" />
        <Text className="text-sm font-semibold text-pink-700 ml-2">New Guest</Text>
      </Pressable>
    </View>
  );

  // --- Empty state ---
  if (invitedGuests.length === 0) {
    return (
      <View>
        <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2">
          <Text className="text-sm text-stone">
            No guests invited to this tournament yet.
          </Text>
        </View>
        <InviteButton />

        {/* Invite picker modal (Android + Web) */}
        <Modal visible={showInviteMenu} transparent animationType="fade" onRequestClose={() => setShowInviteMenu(false)}>
          <Pressable className="flex-1 bg-black/50 justify-center items-center" onPress={() => setShowInviteMenu(false)}>
            <View className="bg-warm-white dark:bg-bark-light rounded-2xl w-72 overflow-hidden">
              <Text className="text-base font-bold text-bark dark:text-cream p-4 pb-2">Invite a Guest</Text>
              {uninvitedGuests.map((g) => (
                <Pressable
                  key={g.id}
                  className="px-4 py-3 border-t border-parchment dark:border-rally-900 active:bg-rally-50"
                  onPress={() => inviteGuest(g)}
                >
                  <Text className="text-sm text-bark dark:text-cream">{g.name}</Text>
                  <Text className="text-xs text-stone mt-0.5">{g.relationship}</Text>
                </Pressable>
              ))}
              <Pressable
                className="px-4 py-3 border-t border-parchment dark:border-rally-900 items-center active:bg-rally-50"
                onPress={() => setShowInviteMenu(false)}
              >
                <Text className="text-sm font-semibold text-stone">Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View>
      {/* Guest list */}
      {invitedGuests.map((item) => (
        <Pressable
          key={item.guest_id}
          className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 mb-2 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
          onPress={() => handleGuestPress(item.guest)}
        >
          {/* Avatar */}
          <View className="w-9 h-9 rounded-full bg-rally-100 dark:bg-rally-900/30 items-center justify-center mr-3">
            <Text className="text-sm font-bold text-rally-600">
              {item.guest.name.charAt(0)}
            </Text>
          </View>

          {/* Name + relationship */}
          <View className="flex-1">
            <Text className="text-sm font-semibold text-bark dark:text-cream">
              {item.guest.name}
            </Text>
            <Text className="text-xs text-stone mt-0.5">{item.guest.relationship}</Text>
          </View>

          {/* SMS hint */}
          <Ionicons name="chatbubble-outline" size={16} color="#3B82B0" />
          <Ionicons name="chevron-forward" size={14} color="#8FA8BF" style={{ marginLeft: 4 }} />
        </Pressable>
      ))}

      {/* Invite more */}
      <InviteButton />

      {/* Invite picker modal (Android + Web) */}
      <Modal visible={showInviteMenu} transparent animationType="fade" onRequestClose={() => setShowInviteMenu(false)}>
        <Pressable className="flex-1 bg-black/50 justify-center items-center" onPress={() => setShowInviteMenu(false)}>
          <View className="bg-warm-white dark:bg-bark-light rounded-2xl w-72 overflow-hidden">
            <Text className="text-base font-bold text-bark dark:text-cream p-4 pb-2">Invite a Guest</Text>
            {uninvitedGuests.map((g) => (
              <Pressable
                key={g.id}
                className="px-4 py-3 border-t border-parchment dark:border-rally-900 active:bg-rally-50"
                onPress={() => inviteGuest(g)}
              >
                <Text className="text-sm text-bark dark:text-cream">{g.name}</Text>
                <Text className="text-xs text-stone mt-0.5">{g.relationship}</Text>
              </Pressable>
            ))}
            <Pressable
              className="px-4 py-3 border-t border-parchment dark:border-rally-900 items-center active:bg-rally-50"
              onPress={() => setShowInviteMenu(false)}
            >
              <Text className="text-sm font-semibold text-stone">Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Guest action modal (Android + Web) — Send In-Person / Streaming */}
      <Modal visible={!!showActionMenu} transparent animationType="fade" onRequestClose={() => setShowActionMenu(null)}>
        <Pressable className="flex-1 bg-black/50 justify-center items-center" onPress={() => setShowActionMenu(null)}>
          <View className="bg-warm-white dark:bg-bark-light rounded-2xl w-72 overflow-hidden">
            <Text className="text-base font-bold text-bark dark:text-cream p-4 pb-2">{showActionMenu?.name}</Text>
            <Pressable
              className="px-4 py-3.5 border-t border-parchment dark:border-rally-900 flex-row items-center active:bg-rally-50"
              onPress={() => {
                if (showActionMenu) sendSMS(showActionMenu, buildInPersonSMS());
                setShowActionMenu(null);
              }}
            >
              <Ionicons name="location" size={18} color="#16a34a" />
              <View className="ml-3">
                <Text className="text-sm font-semibold text-bark dark:text-cream">Send In-Person Details</Text>
                <Text className="text-xs text-stone mt-0.5">Tickets, team code, venue directions</Text>
              </View>
            </Pressable>
            <Pressable
              className="px-4 py-3.5 border-t border-parchment dark:border-rally-900 flex-row items-center active:bg-rally-50"
              onPress={() => {
                if (showActionMenu) sendSMS(showActionMenu, buildStreamingSMS());
                setShowActionMenu(null);
              }}
            >
              <Ionicons name="videocam" size={18} color="#7c3aed" />
              <View className="ml-3">
                <Text className="text-sm font-semibold text-bark dark:text-cream">Send Streaming Details</Text>
                <Text className="text-xs text-stone mt-0.5">Stream link, schedule</Text>
              </View>
            </Pressable>
            <Pressable
              className="px-4 py-3 border-t border-parchment dark:border-rally-900 items-center active:bg-rally-50"
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
