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
  pending: { label: 'Pending', bg: 'bg-gray-100', text: 'text-gray-500', icon: 'time-outline' },
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
      <View className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
        <Text className="text-sm text-gray-400">
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
          <View className="bg-gray-50 rounded-lg px-3 py-1.5 flex-row items-center">
            <Ionicons name="time-outline" size={14} color="#6b7280" />
            <Text className="text-xs font-semibold text-gray-500 ml-1">{pendingCount} Pending</Text>
          </View>
        )}
        {remoteCount > 0 && (
          <View className="bg-blue-50 rounded-lg px-3 py-1.5 flex-row items-center">
            <Ionicons name="videocam" size={14} color="#2563eb" />
            <Text className="text-xs font-semibold text-blue-600 ml-1">{remoteCount} Remote</Text>
          </View>
        )}
      </View>

      {/* Guest list */}
      {invitedGuests.map((item) => {
        const rsvp = RSVP_CONFIG[item.rsvp_status];
        return (
          <View
            key={item.guest_id}
            className="bg-white dark:bg-gray-800 rounded-xl p-3.5 mb-2 border border-gray-100 dark:border-gray-700 flex-row items-center"
          >
            {/* Avatar */}
            <View className="w-9 h-9 rounded-full bg-rally-100 dark:bg-rally-900/30 items-center justify-center mr-3">
              <Text className="text-sm font-bold text-rally-600">
                {item.guest.name.charAt(0)}
              </Text>
            </View>

            {/* Name + relationship */}
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {item.guest.name}
              </Text>
              <View className="flex-row items-center mt-0.5">
                <Text className="text-xs text-gray-400">{item.guest.relationship}</Text>
                {!item.attending_in_person && item.rsvp_status === 'yes' && (
                  <>
                    <Text className="text-xs text-gray-300 mx-1">·</Text>
                    <Text className="text-xs text-blue-500">Watching remotely</Text>
                  </>
                )}
              </View>
            </View>

            {/* RSVP badge */}
            <View className={`flex-row items-center px-2.5 py-1 rounded-full ${rsvp.bg}`}>
              <Ionicons name={rsvp.icon} size={12} color={rsvp.text.includes('green') ? '#16a34a' : rsvp.text.includes('red') ? '#dc2626' : rsvp.text.includes('amber') ? '#d97706' : '#6b7280'} />
              <Text className={`text-xs font-semibold ml-1 ${rsvp.text}`}>{rsvp.label}</Text>
            </View>

            {/* Ticket status for in-person */}
            {item.attending_in_person && item.rsvp_status === 'yes' && (
              <View className={`ml-2 px-2 py-1 rounded-full ${item.ticket_purchased ? 'bg-green-50' : 'bg-gray-50'}`}>
                <Ionicons
                  name={item.ticket_purchased ? 'ticket' : 'ticket-outline'}
                  size={14}
                  color={item.ticket_purchased ? '#16a34a' : '#9ca3af'}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
