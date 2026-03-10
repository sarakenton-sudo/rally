import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { updateTournament as updateTournamentDB } from '@/hooks/useSupabaseData';
import { useAuth } from '@/providers/AuthProvider';
import { useIconColors } from '@/lib/colors';

const CLASS_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  stay_and_play: { icon: 'bed', color: '#7c3aed', label: 'Hotel / Stay & Play' },
  travel_confirmation: { icon: 'airplane', color: '#3B82B0', label: 'Travel Confirmation' },
  coach_announcement: { icon: 'megaphone', color: '#d97706', label: 'Coach Announcement' },
  schedule_change: { icon: 'swap-horizontal', color: '#dc2626', label: 'Schedule Change' },
  tournament_info: { icon: 'trophy', color: '#16a34a', label: 'Tournament Info' },
  other: { icon: 'mail', color: '#8FA8BF', label: 'Other' },
};

const DATA_LABELS: Record<string, string> = {
  hotel_name: 'Hotel',
  check_in_date: 'Check-in',
  check_out_date: 'Check-out',
  confirmation_number: 'Confirmation #',
  nightly_rate: 'Nightly Rate',
  total_cost: 'Total Cost',
  cancellation_deadline: 'Cancel By',
  address: 'Address',
  phone: 'Phone',
  booking_url: 'Booking Link',
  airline: 'Airline',
  flight_number: 'Flight #',
  departure_date: 'Departure',
  departure_time: 'Departs',
  arrival_time: 'Arrives',
  departure_airport: 'From',
  arrival_airport: 'To',
  tournament_name: 'Tournament',
  start_date: 'Start Date',
  end_date: 'End Date',
  location_city: 'City',
  venue_name: 'Venue',
  venue_address: 'Venue Address',
  pool_info: 'Pool',
  check_in_time: 'Check-in Time',
  schedule_url: 'Schedule Link',
  ticket_code: 'Ticket Code',
  ticket_url: 'Ticket Link',
  registration_deadline: 'Register By',
  entry_fee: 'Entry Fee',
  action_items: 'Action Items',
};

function extractTicketUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const urls = text.match(urlRegex) ?? [];
  const ticketKeywords = ['ticket', 'aes', 'gofan', 'aesathletics'];
  return urls.filter((url) => ticketKeywords.some((kw) => url.toLowerCase().includes(kw)));
}

function isUrl(value: string): boolean {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
}

export default function EmailDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ic = useIconColors();
  const email = useSeasonStore((s) => s.forwardedEmails.find((e) => e.id === id));
  const tournaments = useSeasonStore((s) => s.tournaments);
  const updateTournamentStore = useSeasonStore((s) => s.updateTournament);
  const { user } = useAuth();
  const [selectedTournamentName, setSelectedTournamentName] = useState('');
  const [showFullBody, setShowFullBody] = useState(false);

  if (!email) {
    return (
      <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark items-center justify-center">
        <Text className="text-lg text-stone">Email not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-rally-600 font-semibold">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const cls = CLASS_CONFIG[email.classification] ?? CLASS_CONFIG.other;
  const receivedDate = new Date(email.received_at);
  const extractedData = (email as any).extracted_data as Record<string, unknown> | null;
  const hasExtractedData = extractedData && Object.keys(extractedData).length > 0;

  const handleExtractSchedule = async () => {
    if (isSupabaseConfigured && user) {
      try {
        const { data, error } = await supabase.functions.invoke('extract-schedule', {
          body: { text: `Subject: ${email.subject}\n\n${email.body_text}` },
        });

        if (error) throw new Error(error.message);

        const tournaments = data?.tournaments;
        if (!tournaments || tournaments.length === 0) {
          if (Platform.OS === 'web') {
            window.alert('Could not extract tournament details from this email.');
          } else {
            Alert.alert('No tournaments found', 'Could not extract tournament details from this email.');
          }
          return;
        }

        router.push({
          pathname: '/import/review',
          params: { tournaments: JSON.stringify(tournaments) },
        });
      } catch (err: any) {
        if (Platform.OS === 'web') {
          window.alert(err.message);
        } else {
          Alert.alert('Extraction failed', err.message);
        }
      }
    } else {
      router.push({ pathname: '/import/paste' });
    }
  };

  const handleCreateBooking = () => {
    router.push({
      pathname: '/booking/add-hotel',
      params: { emailSubject: email.subject },
    });
  };

  const openUrl = (url: string) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  // Render an extracted data value
  const renderValue = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === '') return null;

    if (Array.isArray(value)) {
      return value.map((v, i) => (
        <Text key={i} className="text-sm text-bark dark:text-cream">
          {typeof v === 'string' && isUrl(v) ? (
            <Text className="text-rally-600 underline" onPress={() => openUrl(v)}>{v}</Text>
          ) : String(v)}
        </Text>
      ));
    }

    const str = String(value);
    if (isUrl(str)) {
      return (
        <Pressable onPress={() => openUrl(str)}>
          <Text className="text-sm text-rally-600 underline" numberOfLines={2}>{str}</Text>
        </Pressable>
      );
    }

    return <Text className="text-sm text-bark dark:text-cream">{str}</Text>;
  };

  const bodyIsLong = email.body_text.length > 500;
  const displayBody = showFullBody ? email.body_text : email.body_text.slice(0, 500);

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-warm-white dark:bg-bark border-b border-parchment dark:border-bark-light">
        <Pressable onPress={() => router.back()} className="p-1 mr-3">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream flex-1" numberOfLines={1}>
          Email Detail
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Classification banner */}
        <View className="flex-row items-center bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-3 border border-parchment dark:border-rally-900">
          <Ionicons name={cls.icon} size={24} color={cls.color} />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-semibold text-bark dark:text-cream">{cls.label}</Text>
            <Text className="text-xs text-stone mt-0.5">
              AI classified • {receivedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        </View>

        {/* Email metadata */}
        <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-3 border border-parchment dark:border-rally-900">
          <View className="mb-3">
            <Text className="text-xs text-stone uppercase tracking-wider">From</Text>
            <Text className="text-sm text-bark dark:text-cream mt-0.5">{email.from_address}</Text>
          </View>
          <View className="mb-3">
            <Text className="text-xs text-stone uppercase tracking-wider">Subject</Text>
            <Text className="text-sm font-semibold text-bark dark:text-cream mt-0.5">{email.subject}</Text>
          </View>
          <View>
            <Text className="text-xs text-stone uppercase tracking-wider">Received</Text>
            <Text className="text-sm text-stone dark:text-parchment mt-0.5">
              {receivedDate.toLocaleString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </Text>
          </View>
        </View>

        {/* Extracted data card */}
        {hasExtractedData && (
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-3 border border-rally-200 dark:border-rally-800">
            <View className="flex-row items-center mb-3">
              <Ionicons name="sparkles" size={18} color="#3B82B0" />
              <Text className="text-sm font-semibold text-rally-700 dark:text-rally-300 ml-2">
                AI Extracted Details
              </Text>
            </View>
            {Object.entries(extractedData!).map(([key, value]) => {
              if (value === null || value === undefined || value === '' || key === 'ticket_urls') return null;
              const label = DATA_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <View key={key} className="flex-row mb-2">
                  <Text className="text-xs text-stone w-28 pt-0.5">{label}</Text>
                  <View className="flex-1">{renderValue(key, value)}</View>
                </View>
              );
            })}
            {/* Show ticket_urls separately as tappable links */}
            {Array.isArray(extractedData!.ticket_urls) && (extractedData!.ticket_urls as string[]).length > 0 && (
              <View className="mt-1">
                <Text className="text-xs text-stone mb-1">Ticket Links</Text>
                {(extractedData!.ticket_urls as string[]).map((url, i) => (
                  <Pressable key={i} onPress={() => openUrl(url)} className="mb-1">
                    <Text className="text-sm text-rally-600 underline" numberOfLines={1}>{url}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Email body */}
        <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-4 border border-parchment dark:border-rally-900">
          <Text className="text-xs text-stone uppercase tracking-wider mb-2">Email Body</Text>
          <Text className="text-sm text-bark dark:text-parchment leading-5" selectable>
            {displayBody}{bodyIsLong && !showFullBody ? '...' : ''}
          </Text>
          {bodyIsLong && (
            <Pressable onPress={() => setShowFullBody(!showFullBody)} className="mt-3 active:opacity-70">
              <Text className="text-sm font-semibold text-rally-600">
                {showFullBody ? 'Show less' : 'Show full email'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Action buttons based on classification */}
        <Text className="text-xs font-semibold text-stone uppercase tracking-wider mb-2 ml-1">
          Actions
        </Text>

        {(email.classification === 'tournament_info' ||
          email.classification === 'schedule_change' ||
          email.classification === 'coach_announcement') && (
          <Pressable
            className="bg-rally-600 rounded-xl py-3.5 items-center flex-row justify-center mb-2 active:opacity-80"
            onPress={handleExtractSchedule}
          >
            <Ionicons name="sparkles" size={18} color="#FEFEFE" />
            <Text className="text-sm font-semibold text-cream ml-2">Extract Tournaments</Text>
          </Pressable>
        )}

        {email.classification === 'tournament_info' && (() => {
          const ticketUrls = [
            ...extractTicketUrls(email.body_text + ' ' + email.subject),
            ...((extractedData?.ticket_urls as string[]) ?? []),
            ...(extractedData?.ticket_url ? [String(extractedData.ticket_url)] : []),
          ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

          if (ticketUrls.length === 0) return null;
          const tournamentOptions = tournaments.map((t) => t.name);
          return (
            <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-3 border border-parchment dark:border-rally-900">
              <View className="flex-row items-center mb-2">
                <Ionicons name="ticket" size={16} color="#16a34a" />
                <Text className="text-sm font-semibold text-bark dark:text-cream ml-2">
                  Ticket Link Found
                </Text>
              </View>
              {ticketUrls.map((url, i) => (
                <Pressable key={i} onPress={() => openUrl(url)} className="mb-1">
                  <Text className="text-xs text-rally-600 underline" numberOfLines={1}>{url}</Text>
                </Pressable>
              ))}
              {extractedData?.ticket_code && (
                <View className="flex-row items-center mt-2 mb-2">
                  <Text className="text-xs text-stone mr-2">Code:</Text>
                  <Text className="text-sm font-bold text-bark dark:text-cream" selectable>
                    {String(extractedData.ticket_code)}
                  </Text>
                </View>
              )}
              <DropdownField
                label="Link to Tournament"
                value={selectedTournamentName}
                options={tournamentOptions}
                onChange={setSelectedTournamentName}
              />
              {selectedTournamentName ? (
                <Pressable
                  className="bg-green-600 rounded-lg py-3 items-center mt-2 active:opacity-80"
                  onPress={async () => {
                    const tournament = tournaments.find((t) => t.name === selectedTournamentName);
                    if (!tournament) return;
                    const updates: any = { ticket_link: ticketUrls[0] };
                    if (extractedData?.ticket_code) {
                      updates.ticket_code = String(extractedData.ticket_code);
                    }
                    if (isSupabaseConfigured && user) {
                      await updateTournamentDB(tournament.id, updates);
                    }
                    updateTournamentStore(tournament.id, updates);
                    if (Platform.OS === 'web') {
                      window.alert(`Ticket link saved to ${tournament.name}.`);
                    } else {
                      Alert.alert('Linked', `Ticket link saved to ${tournament.name}.`);
                    }
                  }}
                >
                  <Text className="text-sm font-semibold text-white">Link Ticket to Tournament</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })()}

        {(email.classification === 'stay_and_play' ||
          email.classification === 'travel_confirmation') && (
          <Pressable
            className="bg-purple-600 rounded-xl py-3.5 items-center flex-row justify-center mb-2 active:opacity-80"
            onPress={handleCreateBooking}
          >
            <Ionicons name="bed" size={18} color="white" />
            <Text className="text-sm font-semibold text-white ml-2">Create Booking</Text>
          </Pressable>
        )}

        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-xl py-3.5 items-center flex-row justify-center border border-parchment dark:border-rally-900 active:opacity-80"
          onPress={handleExtractSchedule}
        >
          <Ionicons name="search" size={18} color={ic.muted} />
          <Text className="text-sm font-semibold text-stone dark:text-parchment ml-2">
            Re-extract with AI
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
