import { Alert } from 'react-native';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useNotifications } from '@/providers/NotificationProvider';
import { useGuestStore } from '@/stores/useGuestStore';
import type { Tournament } from '@/types/database';

/**
 * Hook providing notification action helpers.
 * Calls the send-notification Edge Function for SMS/push delivery,
 * or falls back to local notifications in dev mode.
 */
export function useNotificationActions() {
  const { user } = useAuth();
  const { sendLocalNotification } = useNotifications();
  const guests = useGuestStore((s) => s.guests);
  const tournamentGuests = useGuestStore((s) => s.tournamentGuests);

  /** Send RSVP request to all invited guests for a tournament */
  const sendRSVPRequest = async (tournament: Tournament) => {
    const invited = tournamentGuests
      .filter((tg) => tg.tournament_id === tournament.id && tg.invited)
      .map((tg) => tg.guest_id);

    if (invited.length === 0) {
      Alert.alert('No guests', 'No guests are invited to this tournament.');
      return;
    }

    const title = `RSVP: ${tournament.name}`;
    const body = `Are you coming to ${tournament.name} (${tournament.location_city})? Reply YES, NO, or MAYBE.`;

    if (isSupabaseConfigured && user) {
      const { error } = await supabase.functions.invoke('send-notification', {
        body: {
          user_id: user.id,
          type: 'rsvp_request',
          tournament_id: tournament.id,
          guest_ids: invited,
          title,
          body,
        },
      });

      if (error) {
        Alert.alert('Send failed', error.message);
        return;
      }
    } else {
      // Dev mode: local notification
      await sendLocalNotification(title, `Sent RSVP request to ${invited.length} guests (dev mode)`);
    }

    const guestNames = invited
      .map((id) => guests.find((g) => g.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    Alert.alert('RSVP Sent', `Notified ${invited.length} guests: ${guestNames}`);
  };

  /** Send tournament reminder to parent + all invited guests */
  const sendTournamentReminder = async (tournament: Tournament) => {
    const invited = tournamentGuests
      .filter((tg) => tg.tournament_id === tournament.id && tg.invited && tg.rsvp_status === 'yes')
      .map((tg) => tg.guest_id);

    const title = `Reminder: ${tournament.name}`;
    const body = `${tournament.name} is coming up! ${tournament.location_city}`;

    if (isSupabaseConfigured && user) {
      await supabase.functions.invoke('send-notification', {
        body: {
          user_id: user.id,
          type: 'tournament_reminder',
          tournament_id: tournament.id,
          guest_ids: invited,
          title,
          body,
          data: { tournamentId: tournament.id },
        },
      });
    } else {
      await sendLocalNotification(title, body, { tournamentId: tournament.id });
    }

    Alert.alert('Reminder Sent', `Notified ${invited.length + 1} people (you + ${invited.length} guests)`);
  };

  /** Send cancellation deadline alert */
  const sendDeadlineAlert = async (tournament: Tournament, hotelName: string, deadline: string) => {
    const title = `Cancellation Deadline`;
    const body = `${hotelName} for ${tournament.name} — cancel by ${deadline} for a full refund.`;

    if (isSupabaseConfigured && user) {
      await supabase.functions.invoke('send-notification', {
        body: {
          user_id: user.id,
          type: 'cancellation_deadline',
          tournament_id: tournament.id,
          title,
          body,
          data: { tournamentId: tournament.id },
        },
      });
    } else {
      await sendLocalNotification(title, body, { tournamentId: tournament.id });
    }
  };

  return {
    sendRSVPRequest,
    sendTournamentReminder,
    sendDeadlineAlert,
  };
}
