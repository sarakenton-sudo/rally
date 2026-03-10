import { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DatePickerField from '@/components/DatePickerField';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateTournament as updateTournamentDB } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { TournamentStatus } from '@/types/database';

const STATUS_OPTIONS: TournamentStatus[] = ['upcoming', 'travel_needed', 'booked', 'complete'];
const STATUS_LABELS: Record<TournamentStatus, string> = {
  upcoming: 'Upcoming',
  travel_needed: 'Needs Booking',
  booked: 'Booked',
  complete: 'Complete',
};

export default function EditTournamentScreen() {
  const { editId } = useLocalSearchParams<{ editId: string }>();
  const existing = useSeasonStore((s) => s.tournaments.find((t) => t.id === editId));

  const [name, setName] = useState(existing?.name ?? '');
  const [locationCity, setLocationCity] = useState(existing?.location_city ?? '');
  const [startDate, setStartDate] = useState<Date | null>(
    existing ? new Date(existing.start_date) : null
  );
  const [endDate, setEndDate] = useState<Date | null>(
    existing ? new Date(existing.end_date) : null
  );
  const [status, setStatus] = useState<string>(existing?.status ?? 'upcoming');
  const [travelRequired, setTravelRequired] = useState(existing?.travel_required ?? false);
  const [ticketLink, setTicketLink] = useState(existing?.ticket_link ?? '');
  const [ticketSystem, setTicketSystem] = useState(existing?.ticket_system ?? '');
  const [aesTournamentId, setAesTournamentId] = useState(existing?.aes_tournament_id ?? '');
  const [sportwrenchUrl, setSportwrenchUrl] = useState(existing?.sportwrench_url ?? '');
  const [venueName, setVenueName] = useState(existing?.venues?.[0]?.label ?? '');
  const [venueAddress, setVenueAddress] = useState(existing?.venues?.[0]?.address ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const ic = useIconColors();
  const { user } = useAuth();
  const updateTournamentStore = useSeasonStore((s) => s.updateTournament);
  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  if (!existing) {
    return (
      <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark items-center justify-center">
        <Text className="text-lg text-stone">Tournament not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="text-rally-600 font-semibold">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing field', 'Please enter a tournament name.');
      return;
    }
    if (!startDate || !endDate) {
      Alert.alert('Missing field', 'Please set start and end dates.');
      return;
    }

    setIsSaving(true);

    const venues = venueName.trim() ? [{
      label: venueName.trim(),
      address: venueAddress.trim() || '',
      is_confirmed: true,
    }] : existing.venues;

    const updates = {
      name: name.trim(),
      location_city: locationCity.trim(),
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      status: status as TournamentStatus,
      travel_required: travelRequired,
      venues,
      ticket_link: ticketLink.trim() || null,
      ticket_system: ticketSystem.trim() || null,
      aes_tournament_id: aesTournamentId.trim() || null,
      sportwrench_url: sportwrenchUrl.trim() || null,
    };

    try {
      if (isSupabaseConfigured && user) {
        const { error } = await updateTournamentDB(editId, updates);
        if (error) {
          Alert.alert('Save failed', error.message);
          return;
        }
      }
      updateTournamentStore(editId, updates);
      notifySuccess();
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  const statusDisplayOptions = STATUS_OPTIONS.map((s) => STATUS_LABELS[s]);
  const handleStatusChange = (label: string) => {
    const entry = Object.entries(STATUS_LABELS).find(([, v]) => v === label);
    if (entry) setStatus(entry[0]);
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
            Edit Tournament
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
          <FormField label="Tournament Name" value={name} onChangeText={setName} placeholder="e.g. Lonestar Classic" />
          <FormField label="City" value={locationCity} onChangeText={setLocationCity} placeholder="e.g. Dallas, TX" />
          <FormField label="Venue Name" value={venueName} onChangeText={setVenueName} placeholder="e.g. Dallas Convention Center" />
          <FormField label="Venue Address" value={venueAddress} onChangeText={setVenueAddress} placeholder="e.g. 650 S Griffin St, Dallas, TX" />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <DatePickerField label="Start Date" value={startDate} onChange={setStartDate} />
            </View>
            <View className="flex-1">
              <DatePickerField label="End Date" value={endDate} onChange={setEndDate} />
            </View>
          </View>

          <DropdownField
            label="Status"
            value={STATUS_LABELS[status as TournamentStatus] ?? 'Upcoming'}
            options={statusDisplayOptions}
            onChange={handleStatusChange}
          />

          {/* Travel required toggle */}
          <View className="flex-row items-center justify-between mb-6 bg-cream dark:bg-bark-light rounded-xl px-4 py-3">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-medium text-bark dark:text-parchment">
                Travel Required
              </Text>
              <Text className="text-xs text-stone dark:text-stone mt-0.5">
                Mark if hotel/flight bookings are needed
              </Text>
            </View>
            <Switch
              value={travelRequired}
              onValueChange={setTravelRequired}
              trackColor={{ false: '#D8E2EC', true: '#7DBDD9' }}
              thumbColor={travelRequired ? '#3B82B0' : '#FEFEFE'}
            />
          </View>

          <FormField label="Ticket Link" value={ticketLink} onChangeText={setTicketLink} placeholder="https://..." keyboardType="url" />
          <FormField label="Ticket System" value={ticketSystem} onChangeText={setTicketSystem} placeholder="e.g. GoFan, AES" />
          <FormField label="AES Tournament ID" value={aesTournamentId} onChangeText={setAesTournamentId} placeholder="e.g. 12345" />
          <FormField label="SportsWrench URL" value={sportwrenchUrl} onChangeText={setSportwrenchUrl} placeholder="https://..." keyboardType="url" />

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
