import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
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

function extractTicketUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const urls = text.match(urlRegex) ?? [];
  const ticketKeywords = ['ticket', 'aes', 'gofan', 'aesathletics'];
  return urls.filter((url) => ticketKeywords.some((kw) => url.toLowerCase().includes(kw)));
}

export default function EmailDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ic = useIconColors();
  const email = useSeasonStore((s) => s.forwardedEmails.find((e) => e.id === id));
  const tournaments = useSeasonStore((s) => s.tournaments);
  const updateTournamentStore = useSeasonStore((s) => s.updateTournament);
  const { user } = useAuth();
  const [selectedTournamentName, setSelectedTournamentName] = useState('');

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

  const handleExtractSchedule = async () => {
    if (isSupabaseConfigured && user) {
      try {
        const { data, error } = await supabase.functions.invoke('extract-schedule', {
          body: { text: `Subject: ${email.subject}\n\n${email.body_text}` },
        });

        if (error) throw new Error(error.message);

        const tournaments = data?.tournaments;
        if (!tournaments || tournaments.length === 0) {
          Alert.alert('No tournaments found', 'Could not extract tournament details from this email.');
          return;
        }

        router.push({
          pathname: '/import/review',
          params: { tournaments: JSON.stringify(tournaments) },
        });
      } catch (err: any) {
        Alert.alert('Extraction failed', err.message);
      }
    } else {
      router.push({
        pathname: '/import/paste',
      });
    }
  };

  const handleCreateBooking = () => {
    router.push({
      pathname: '/booking/add-hotel',
      params: { emailSubject: email.subject },
    });
  };

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

        {/* Email body */}
        <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-4 border border-parchment dark:border-rally-900">
          <Text className="text-xs text-stone uppercase tracking-wider mb-2">Body</Text>
          <Text className="text-sm text-bark dark:text-parchment leading-5">
            {email.body_text}
          </Text>
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
          const ticketUrls = extractTicketUrls(email.body_text + ' ' + email.subject);
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
              <Text className="text-xs text-stone mb-3" numberOfLines={1}>{ticketUrls[0]}</Text>
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
                    if (isSupabaseConfigured && user) {
                      await updateTournamentDB(tournament.id, { ticket_link: ticketUrls[0] });
                    }
                    updateTournamentStore(tournament.id, { ticket_link: ticketUrls[0] });
                    Alert.alert('Linked', `Ticket link saved to ${tournament.name}.`);
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
