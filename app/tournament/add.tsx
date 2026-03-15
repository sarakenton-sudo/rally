import { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DatePickerField from '@/components/DatePickerField';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { insertTournament } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { Tournament } from '@/types/database';

export default function AddTournamentScreen() {
  const ic = useIconColors();
  const { user } = useAuth();

  const athletes = useSeasonStore((s) => s.athletes);
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const addTournament = useSeasonStore((s) => s.addTournament);

  // Form state
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [locationCity, setLocationCity] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [scheduleLink, setScheduleLink] = useState('');
  const [ticketLink, setTicketLink] = useState('');
  const [ticketSystem, setTicketSystem] = useState('');
  const [notes, setNotes] = useState('');
  const [travelRequired, setTravelRequired] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Athlete/season selection
  const hasMultipleAthletes = athletes.length > 1;
  const [selectedAthleteId, setSelectedAthleteId] = useState(() => {
    const activeSeason = seasons.find((s) => s.id === activeSeasonId);
    return activeSeason?.athlete_id ?? athletes[0]?.id ?? '';
  });

  const athleteSeasons = useMemo(
    () => seasons.filter((s) => s.athlete_id === selectedAthleteId),
    [seasons, selectedAthleteId]
  );
  const selectedSeasonId = athleteSeasons.find((s) => s.id === activeSeasonId)?.id ?? athleteSeasons[0]?.id ?? '';

  const handleAthleteChange = (displayName: string) => {
    const a = athletes.find(
      (ath) => `${ath.first_name}${ath.last_name ? ' ' + ath.last_name : ''}` === displayName
    );
    if (a) setSelectedAthleteId(a.id);
  };

  const showError = (title: string, message: string) => {
    setSaveError(message);
    if (Platform.OS !== 'web') Alert.alert(title, message);
  };

  const handleSave = async () => {
    setSaveError(null);
    if (!name.trim()) { showError('Missing field', 'Please enter a tournament name.'); return; }
    if (!startDate) { showError('Missing field', 'Please select a start date.'); return; }

    if (!selectedSeasonId) {
      showError('No season', 'No active season found. Please set up a season first.');
      return;
    }

    setIsSaving(true);

    const start = startDate.toISOString().split('T')[0];
    const end = endDate ? endDate.toISOString().split('T')[0] : start;

    const tournamentData = {
      season_id: selectedSeasonId,
      name: name.trim(),
      start_date: start,
      end_date: end,
      location_city: locationCity.trim(),
      venues: venueName.trim() || venueAddress.trim()
        ? [{ label: venueName.trim(), address: venueAddress.trim() || locationCity.trim(), is_confirmed: false }]
        : [],
      ticket_system: ticketSystem.trim() || null,
      ticket_link: ticketLink.trim() || null,
      aes_tournament_id: null,
      aes_feed_data: null,
      aes_feed_last_updated: null,
      aes_feed_available: false,
      schedule_link: scheduleLink.trim() || null,
      schedule_available_date: null,
      ticket_sales_date: null,
      tickets_purchased: false,
      streaming_links: [],
      air_not_needed: false,
      hotel_not_needed: false,
      travel_required: travelRequired,
      status: 'upcoming' as const,
    };

    try {
      if (isSupabaseConfigured && user) {
        const { data, error } = await insertTournament(tournamentData);
        if (error) {
          showError('Save failed', error.message);
          return;
        }
        if (data) addTournament(data);
      } else {
        const tournament: Tournament = {
          ...tournamentData,
          id: `t-manual-${Date.now()}`,
          created_at: new Date().toISOString(),
        };
        addTournament(tournament);
      }
      notifySuccess();
      router.back();
    } catch (err: any) {
      showError('Error', err.message || 'Failed to save tournament.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">
            Add a Tournament
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            className={`px-4 py-1.5 rounded-lg ${isSaving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-cream">{isSaving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          {/* Error display */}
          {saveError && (
            <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mb-4 flex-row items-start">
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text className="text-sm text-red-700 dark:text-red-300 ml-2 flex-1">{saveError}</Text>
            </View>
          )}

          {/* Athlete selector (multi-athlete only) */}
          {hasMultipleAthletes && (
            <DropdownField
              label="Athlete"
              value={athletes.find((a) => a.id === selectedAthleteId)
                ? `${athletes.find((a) => a.id === selectedAthleteId)!.first_name}${athletes.find((a) => a.id === selectedAthleteId)!.last_name ? ' ' + athletes.find((a) => a.id === selectedAthleteId)!.last_name : ''}`
                : ''}
              options={athletes.map((a) => `${a.first_name}${a.last_name ? ' ' + a.last_name : ''}`)}
              onChange={handleAthleteChange}
            />
          )}

          <FormField label="Tournament Name" value={name} onChangeText={setName} placeholder="e.g. AJV Premier #1" />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <DatePickerField label="Start Date" value={startDate} onChange={setStartDate} />
            </View>
            <View className="flex-1">
              <DatePickerField label="End Date" value={endDate} onChange={setEndDate} />
            </View>
          </View>

          <FormField label="City" value={locationCity} onChangeText={setLocationCity} placeholder="e.g. Austin, TX" />
          <FormField label="Venue Name" value={venueName} onChangeText={setVenueName} placeholder="e.g. Austin Convention Center" />
          <FormField label="Venue Address" value={venueAddress} onChangeText={setVenueAddress} placeholder="Full street address" />

          {/* Divider */}
          <View className="border-t border-parchment dark:border-rally-900 my-4" />

          <FormField label="Schedule Link" value={scheduleLink} onChangeText={setScheduleLink} placeholder="https://..." autoCapitalize="none" keyboardType="url" />
          <FormField label="Ticket Link" value={ticketLink} onChangeText={setTicketLink} placeholder="https://..." autoCapitalize="none" keyboardType="url" />
          <FormField label="Ticket Platform" value={ticketSystem} onChangeText={setTicketSystem} placeholder="e.g. AES, LeagueApps" />

          {/* Divider */}
          <View className="border-t border-parchment dark:border-rally-900 my-4" />

          <FormField label="Notes" value={notes} onChangeText={setNotes} placeholder="Any extra info" multiline />

          {/* Travel required toggle */}
          <View className="flex-row items-center justify-between mb-6 bg-cream dark:bg-bark-light rounded-xl px-4 py-3">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-medium text-bark dark:text-parchment">
                Travel Required
              </Text>
              <Text className="text-xs text-stone dark:text-stone mt-0.5">
                Show hotel and flight sections
              </Text>
            </View>
            <Pressable
              className={`w-12 h-7 rounded-full justify-center ${travelRequired ? 'bg-green-400' : 'bg-parchment'}`}
              onPress={() => setTravelRequired(!travelRequired)}
            >
              <View className={`w-5 h-5 rounded-full bg-white shadow ${travelRequired ? 'ml-6' : 'ml-1'}`} />
            </Pressable>
          </View>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
