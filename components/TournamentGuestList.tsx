import { View, Text, Pressable, Alert, ActionSheetIOS, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useGuestStore } from '@/stores/useGuestStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { upsertTournamentGuest } from '@/hooks/useSupabaseData';
import { useAuth } from '@/providers/AuthProvider';
import { useNotifications } from '@/providers/NotificationProvider';
import type { TournamentGuest, RSVPStatus, Guest } from '@/types/database';

interface TournamentGuestListProps {
  tournamentId: string;
  tournamentName?: string;
  tournamentCity?: string;
}

const RSVP_CONFIG: Record<RSVPStatus, { label: string; bg: string; text: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  yes: { label: 'Yes', bg: 'bg-green-100', text: 'text-green-700', icon: 'checkmark-circle', color: '#16a34a' },
  no: { label: 'No', bg: 'bg-red-100', text: 'text-red-600', icon: 'close-circle', color: '#dc2626' },
  maybe: { label: 'Maybe', bg: 'bg-amber-100', text: 'text-amber-700', icon: 'help-circle', color: '#d97706' },
  pending: { label: 'Pending', bg: 'bg-cream', text: 'text-stone', icon: 'time-outline', color: '#8FA8BF' },
};

export default function TournamentGuestList({ tournamentId, tournamentName, tournamentCity }: TournamentGuestListProps) {
  const guests = useGuestStore((s) => s.guests);
  const tournamentGuests = useGuestStore((s) => s.tournamentGuests);
  const { user } = useAuth();
  const { sendLocalNotification } = useNotifications();

  const invitedGuests = tournamentGuests
    .filter((tg) => tg.tournament_id === tournamentId && tg.invited)
    .map((tg) => {
      const guest = guests.find((g) => g.id === tg.guest_id);
      return guest ? { ...tg, guest } : null;
    })
    .filter(Boolean) as (TournamentGuest & { guest: Guest })[];

  const yesCount = invitedGuests.filter((g) => g.rsvp_status === 'yes').length;
  const maybeCount = invitedGuests.filter((g) => g.rsvp_status === 'maybe').length;
  const pendingCount = invitedGuests.filter((g) => g.rsvp_status === 'pending').length;

  const sendToGuest = async (guest: Guest, type: 'invite' | 'reminder') => {
    const name = tournamentName ?? 'this tournament';
    const city = tournamentCity ?? '';
    const title = type === 'invite'
      ? `RSVP: ${name}`
      : `Reminder: ${name}`;
    const body = type === 'invite'
      ? `Are you coming to ${name}${city ? ` (${city})` : ''}? Reply YES, NO, or MAYBE.`
      : `${name} is coming up!${city ? ` ${city}` : ''}`;

    if (isSupabaseConfigured && user) {
      const { error } = await supabase.functions.invoke('send-notification', {
        body: {
          user_id: user.id,
          type: type === 'invite' ? 'rsvp_request' : 'tournament_reminder',
          tournament_id: tournamentId,
          guest_ids: [guest.id],
          title,
          body,
        },
      });
      if (error) {
        Alert.alert('Send failed', error.message);
        return;
      }
    } else {
      await sendLocalNotification(title, `${type === 'invite' ? 'RSVP request' : 'Reminder'} sent to ${guest.name} (dev mode)`);
    }

    Alert.alert('Sent', `${type === 'invite' ? 'RSVP request' : 'Reminder'} sent to ${guest.name}`);
  };

  const handleGuestPress = (guest: Guest, rsvpStatus: RSVPStatus) => {
    const options = rsvpStatus === 'pending'
      ? ['Send Invite', 'Cancel']
      : ['Send Reminder', 'Send Invite', 'Cancel'];
    const cancelIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, title: guest.name },
        (index) => {
          if (rsvpStatus === 'pending') {
            if (index === 0) sendToGuest(guest, 'invite');
          } else {
            if (index === 0) sendToGuest(guest, 'reminder');
            if (index === 1) sendToGuest(guest, 'invite');
          }
        }
      );
    } else {
      // Android fallback
      Alert.alert(guest.name, 'Choose an action', [
        { text: 'Send Invite', onPress: () => sendToGuest(guest, 'invite') },
        ...(rsvpStatus !== 'pending' ? [{ text: 'Send Reminder', onPress: () => sendToGuest(guest, 'reminder') }] : []),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  const addTournamentGuest = useGuestStore((s) => s.addTournamentGuest);

  const uninvitedGuests = guests.filter(
    (g) => !tournamentGuests.some((tg) => tg.tournament_id === tournamentId && tg.guest_id === g.id)
  );

  const handleInviteGuest = () => {
    if (guests.length === 0) {
      // No guests at all — send to add guest screen
      router.push('/guest/add');
      return;
    }
    if (uninvitedGuests.length === 0) {
      Alert.alert('All invited', 'All your guests are already invited to this tournament.');
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
      Alert.alert('Invite a Guest', 'Choose a guest to invite', [
        ...uninvitedGuests.map((g) => ({ text: g.name, onPress: () => inviteGuest(g) })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  const inviteGuest = async (guest: Guest) => {
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
        Alert.alert('Failed', error.message);
        return;
      }
    }
    addTournamentGuest(tg);
    Alert.alert('Invited', `${guest.name} has been invited.`);
  };

  const InviteButton = () => (
    <Pressable
      className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 mb-2 border border-dashed border-parchment dark:border-rally-900 flex-row items-center justify-center active:opacity-80"
      onPress={handleInviteGuest}
    >
      <Ionicons name="person-add-outline" size={16} color="#3B82B0" />
      <Text className="text-sm font-semibold text-rally-600 ml-2">Invite Guest</Text>
    </Pressable>
  );

  if (invitedGuests.length === 0) {
    return (
      <View>
        <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2">
          <Text className="text-sm text-stone">
            No guests invited to this tournament yet.
          </Text>
        </View>
        <InviteButton />
      </View>
    );
  }

  return (
    <View>
      {/* Summary bar */}
      <View className="flex-row mb-3 gap-2">
        <View className="bg-green-50 rounded-lg px-3 py-1.5 flex-row items-center">
          <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
          <Text className="text-xs font-semibold text-green-700 ml-1">{yesCount} Yes</Text>
        </View>
        {maybeCount > 0 && (
          <View className="bg-amber-50 rounded-lg px-3 py-1.5 flex-row items-center">
            <Ionicons name="help-circle" size={14} color="#d97706" />
            <Text className="text-xs font-semibold text-amber-700 ml-1">{maybeCount} Maybe</Text>
          </View>
        )}
        {pendingCount > 0 && (
          <View className="bg-cream rounded-lg px-3 py-1.5 flex-row items-center">
            <Ionicons name="time-outline" size={14} color="#8FA8BF" />
            <Text className="text-xs font-semibold text-stone ml-1">{pendingCount} Pending</Text>
          </View>
        )}
      </View>

      {/* Guest list */}
      {invitedGuests.map((item) => {
        const rsvp = RSVP_CONFIG[item.rsvp_status];
        return (
          <Pressable
            key={item.guest_id}
            className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 mb-2 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
            onPress={() => handleGuestPress(item.guest, item.rsvp_status)}
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

            {/* RSVP badge */}
            <View className={`flex-row items-center px-2.5 py-1 rounded-full ${rsvp.bg}`}>
              <Ionicons name={rsvp.icon} size={12} color={rsvp.color} />
              <Text className={`text-xs font-semibold ml-1 ${rsvp.text}`}>{rsvp.label}</Text>
            </View>

            {/* Chevron hint */}
            <Ionicons name="chevron-forward" size={14} color="#8FA8BF" style={{ marginLeft: 4 }} />
          </Pressable>
        );
      })}

      {/* Invite more */}
      <InviteButton />
    </View>
  );
}
