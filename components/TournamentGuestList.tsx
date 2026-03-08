import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGuestStore } from '@/stores/useGuestStore';
import type { TournamentGuest, RSVPStatus } from '@/types/database';

interface TournamentGuestListProps {
  tournamentId: string;
}

const RSVP_CONFIG: Record<RSVPStatus, { label: string; bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> = {
  yes: { label: 'Yes', bg: 'bg-green-100', text: 'text-green-700', icon: 'checkmark-circle' },
  no: { label: 'No', bg: 'bg-red-100', text: 'text-red-600', icon: 'close-circle' },
  maybe: { label: 'Maybe', bg: 'bg-amber-100', text: 'text-amber-700', icon: 'help-circle' },
  pending: { label: 'Pending', bg: 'bg-cream', text: 'text-stone', icon: 'time-outline' },
};

export default function TournamentGuestList({ tournamentId }: TournamentGuestListProps) {
  const guests = useGuestStore((s) => s.guests);
  const tournamentGuests = useGuestStore((s) => s.tournamentGuests);

  const invitedGuests = tournamentGuests
    .filter((tg) => tg.tournament_id === tournamentId && tg.invited)
    .map((tg) => {
      const guest = guests.find((g) => g.id === tg.guest_id);
      return guest ? { ...tg, guest } : null;
    })
    .filter(Boolean) as (TournamentGuest & { guest: (typeof guests)[0] })[];

  const yesCount = invitedGuests.filter((g) => g.rsvp_status === 'yes').length;
  const maybeCount = invitedGuests.filter((g) => g.rsvp_status === 'maybe').length;
  const pendingCount = invitedGuests.filter((g) => g.rsvp_status === 'pending').length;
  const remoteCount = invitedGuests.filter((g) => !g.attending_in_person && g.rsvp_status === 'yes').length;

  if (invitedGuests.length === 0) {
    return (
      <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900">
        <Text className="text-sm text-stone">
          No guests invited to this tournament yet.
        </Text>
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
            <Ionicons name="time-outline" size={14} color="#9E8E7E" />
            <Text className="text-xs font-semibold text-stone ml-1">{pendingCount} Pending</Text>
          </View>
        )}
        {remoteCount > 0 && (
          <View className="bg-rally-50 rounded-lg px-3 py-1.5 flex-row items-center">
            <Ionicons name="videocam" size={14} color="#C4714A" />
            <Text className="text-xs font-semibold text-rally-600 ml-1">{remoteCount} Remote</Text>
          </View>
        )}
      </View>

      {/* Guest list */}
      {invitedGuests.map((item) => {
        const rsvp = RSVP_CONFIG[item.rsvp_status];
        return (
          <View
            key={item.guest_id}
            className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 mb-2 border border-parchment dark:border-rally-900 flex-row items-center"
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
              <View className="flex-row items-center mt-0.5">
                <Text className="text-xs text-stone">{item.guest.relationship}</Text>
                {!item.attending_in_person && item.rsvp_status === 'yes' && (
                  <>
                    <Text className="text-xs text-parchment mx-1">·</Text>
                    <Text className="text-xs text-rally-500">Watching remotely</Text>
                  </>
                )}
              </View>
            </View>

            {/* RSVP badge */}
            <View className={`flex-row items-center px-2.5 py-1 rounded-full ${rsvp.bg}`}>
              <Ionicons name={rsvp.icon} size={12} color={rsvp.text.includes('green') ? '#16a34a' : rsvp.text.includes('red') ? '#dc2626' : rsvp.text.includes('amber') ? '#d97706' : '#9E8E7E'} />
              <Text className={`text-xs font-semibold ml-1 ${rsvp.text}`}>{rsvp.label}</Text>
            </View>

            {/* Ticket status for in-person */}
            {item.attending_in_person && item.rsvp_status === 'yes' && (
              <View className={`ml-2 px-2 py-1 rounded-full ${item.ticket_purchased ? 'bg-green-50' : 'bg-cream'}`}>
                <Ionicons
                  name={item.ticket_purchased ? 'ticket' : 'ticket-outline'}
                  size={14}
                  color={item.ticket_purchased ? '#16a34a' : '#9E8E7E'}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
