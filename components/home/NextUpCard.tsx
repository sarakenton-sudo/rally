import { View, Text, Pressable, Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/components/Toast';
import { tapLight } from '@/lib/haptics';
import { formatDateRange } from '@/lib/dates';
import { TOURNAMENT_COLOR, GOLD } from '@/lib/colors';
import { sessionKindStyle, type ParentLesson } from '@/lib/coach';
import { countdownLabel, type NextUp } from '@/lib/nextUp';
import { platformFor } from '@/lib/loginPlatforms';
import type { Tournament, HotelBooking, ExternalLink } from '@/types/database';

const mapsUrl = (address: string) =>
  Platform.OS === 'ios' ? `maps://?q=${encodeURIComponent(address)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

function Tile({ icon, label, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { tapLight(); onPress(); }}
      className="rounded-xl px-3 py-2.5 active:opacity-70"
      style={{ backgroundColor: 'rgba(255,255,255,0.14)', width: '48%' }}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
    >
      <View className="flex-row items-center">
        <Ionicons name={icon} size={15} color="#fff" />
        <Text className="text-xs font-bold text-white ml-1.5" numberOfLines={1}>{label}</Text>
      </View>
      {sub ? <Text className="text-[11px] text-white/80 mt-0.5" numberOfLines={1}>{sub}</Text> : null}
    </Pressable>
  );
}

/**
 * Home "Next up": one card for the next thing on the calendar. On tournament
 * weekends (and the day before) it becomes game day: team code, schedule,
 * stream, tickets, hotel and event login, each one tap away.
 */
export default function NextUpCard({ next, tournament, lesson, hotels, teamCode, familyLogins, athleteName }: {
  next: NextUp;
  tournament?: Tournament;
  lesson?: ParentLesson;
  hotels: HotelBooking[];
  teamCode?: string | null;
  familyLogins: ExternalLink[];
  athleteName?: string;
}) {
  if (!next) {
    return (
      <Pressable
        onPress={() => router.push('/season')}
        className="rounded-2xl p-5 bg-warm-white dark:bg-bark-light border border-dashed border-parchment dark:border-rally-900 active:opacity-80"
      >
        <Text className="text-base font-bold text-bark dark:text-cream">Nothing on the calendar yet</Text>
        <Text className="text-xs text-stone dark:text-parchment mt-1">Tap + to paste a schedule, add a tournament, or book a lesson.</Text>
      </Pressable>
    );
  }

  if (next.kind === 'lesson' && lesson) {
    const st = sessionKindStyle(lesson.session_kind);
    const start = new Date(lesson.starts_at);
    const sameDay = start.toDateString() === new Date().toDateString();
    return (
      <Pressable
        onPress={() => router.push('/coaching')}
        className="rounded-2xl p-5 active:opacity-90"
        style={{ backgroundColor: st.color }}
        accessibilityLabel={`Next up: ${lesson.session_type ?? st.label} with ${lesson.coach_name}`}
      >
        <Text className="text-[11px] font-bold uppercase tracking-wider text-white/80">Next up · {lesson.status === 'accepted' ? 'Confirmed' : 'Requested'}</Text>
        <Text className="text-xl font-extrabold text-white mt-1">
          {lesson.session_type ?? st.label}{athleteName ? ` · ${athleteName}` : ''}
        </Text>
        <Text className="text-sm text-white/90 mt-1">
          {sameDay ? 'Today' : start.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} at {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </Text>
        <Text className="text-xs text-white/80 mt-0.5">with {lesson.coach_name}{lesson.facility ? ` · ${lesson.facility}` : ''}</Text>
      </Pressable>
    );
  }

  if (next.kind !== 'tournament' || !tournament) return null;
  const t = tournament;
  const mainHotel = hotels.find((h) => !h.is_backup) ?? hotels[0];
  const venue = t.venues?.find((v) => v.is_confirmed) ?? t.venues?.[0];
  const eventLogin = familyLogins.find((l) => platformFor(l.label) === 'aes');
  const copy = async (text: string, what: string) => { await Clipboard.setStringAsync(text); showToast(`${what} copied`); };

  const hotelChip = hotels.length
    ? { icon: 'checkmark-circle' as const, text: `${mainHotel.hotel_name}${hotels.length > 1 ? ` +${hotels.length - 1}` : ''}` }
    : { icon: 'alert-circle' as const, text: 'No hotel yet' };

  return (
    <View className="rounded-2xl p-5" style={{ backgroundColor: TOURNAMENT_COLOR }}>
      <Pressable onPress={() => router.push(`/tournament/${t.id}`)} accessibilityLabel={`Next up: ${t.name}`}>
        {next.gameDay ? (
          <View className="self-start rounded-full px-2.5 py-0.5" style={{ backgroundColor: GOLD }}>
            <Text className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: '#1E3A5F' }}>
              {next.live ? 'Game day' : `Game day · ${countdownLabel(next.daysAway)}`}
            </Text>
          </View>
        ) : (
          <Text className="text-[11px] font-bold uppercase tracking-wider text-white/85">{`Next up · ${countdownLabel(next.daysAway)}`}</Text>
        )}
        <Text className="text-xl font-extrabold text-white mt-1" numberOfLines={2}>{t.name}</Text>
        <Text className="text-sm text-white/90 mt-1">
          {formatDateRange(t.start_date, t.end_date)} · {venue?.label || t.location_city}{athleteName ? ` · ${athleteName}` : ''}
        </Text>
        {!next.gameDay && (
          <View className="flex-row items-center mt-3">
            <Ionicons name={hotelChip.icon} size={14} color="#fff" />
            <Text className="text-xs font-semibold text-white ml-1">{hotelChip.text}</Text>
            <Text className="text-xs text-white/80 ml-auto">Details ›</Text>
          </View>
        )}
      </Pressable>

      {next.gameDay && (
        <View className="flex-row flex-wrap mt-4" style={{ gap: 8, justifyContent: 'space-between' }}>
          {teamCode ? <Tile icon="key" label="Team code" sub={teamCode} onPress={() => copy(teamCode, 'Team code')} /> : null}
          {t.schedule_link ? <Tile icon="list" label="Schedule" sub="Pools & brackets" onPress={() => Linking.openURL(t.schedule_link!)} /> : null}
          {t.streaming_links?.[0] ? <Tile icon="videocam" label="Watch" sub={t.streaming_links[0].label} onPress={() => Linking.openURL(t.streaming_links[0].url)} /> : null}
          {t.ticket_link ? <Tile icon="ticket" label="Tickets" sub={t.tickets_purchased ? 'Purchased' : 'Buy'} onPress={() => router.push(`/tournament/${t.id}`)} /> : null}
          {mainHotel?.address ? <Tile icon="bed" label="Hotel" sub={mainHotel.hotel_name} onPress={() => Linking.openURL(mapsUrl(mainHotel.address))} /> : null}
          {venue?.address ? <Tile icon="location" label="Venue" sub={venue.label || 'Directions'} onPress={() => Linking.openURL(mapsUrl(venue.address))} /> : null}
          {eventLogin ? (
            <Tile icon="log-in" label="Event login" sub={eventLogin.username ?? 'Open'} onPress={() => {
              if (eventLogin.password) copy(eventLogin.password, 'Password');
              if (eventLogin.url) Linking.openURL(eventLogin.url);
            }} />
          ) : null}
          <Tile icon="information-circle" label="Everything else" sub="Tournament details" onPress={() => router.push(`/tournament/${t.id}`)} />
        </View>
      )}
    </View>
  );
}
