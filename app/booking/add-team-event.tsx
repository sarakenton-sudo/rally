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
import { insertTeamEvent } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { TeamEvent } from '@/types/database';

export default function AddTeamEventScreen() {
  const params = useLocalSearchParams<{ tournamentId?: string }>();
  const [name, setName] = useState('');
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');
  const [eventDate, setEventDate] = useState<Date | null>(null);
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [selectedTournamentId, setSelectedTournamentId] = useState(params.tournamentId ?? '');

  const tournaments = useSeasonStore((s) => s.tournaments);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const { user } = useAuth();
  const ic = useIconColors();

  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const tournamentOptions = useMemo(
    () => ['None (standalone)', ...tournaments.map((t) => t.name)],
    [tournaments]
  );
  const selectedTournamentName = tournaments.find((t) => t.id === selectedTournamentId)?.name ?? 'None (standalone)';

  const handleTournamentChange = (name: string) => {
    if (name === 'None (standalone)') {
      setSelectedTournamentId('');
    } else {
      const t = tournaments.find((tour) => tour.name === name);
      if (t) setSelectedTournamentId(t.id);
    }
  };

  const showAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { showAlert('Missing field', 'Please enter an event name.'); return; }
    if (!activeSeasonId) { showAlert('Error', 'No active season.'); return; }

    setIsSaving(true);

    const eventData: Omit<TeamEvent, 'id' | 'created_at'> = {
      tournament_id: selectedTournamentId || null,
      name: name.trim(),
      date: eventDate ? eventDate.toISOString().split('T')[0] : '',
      time: time.trim(),
      venue_name: venueName.trim(),
      address: address.trim(),
      reservation_name: null,
      reservation_number: null,
      party_size: null,
      notes: notes.trim() || null,
      family_welcome: true,
      season_id: activeSeasonId,
    };

    try {
      if (isSupabaseConfigured && user) {
        const { error } = await insertTeamEvent(eventData);
        if (error) { showAlert('Save failed', error.message); setIsSaving(false); return; }
      }
      notifySuccess();
      router.back();
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
            Add Team Event
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
          <FormField label="Event Name" value={name} onChangeText={setName} placeholder="e.g. Team Dinner" />
          <DropdownField label="Tournament (optional)" value={selectedTournamentName} options={tournamentOptions} onChange={handleTournamentChange} />
          <FormField label="Location Name" value={venueName} onChangeText={setVenueName} placeholder="e.g. Pappadeaux Seafood Kitchen" />
          <FormField label="Address" value={address} onChangeText={setAddress} placeholder="e.g. 6025 Westheimer Rd, Houston, TX" />
          <DatePickerField label="Date" value={eventDate} onChange={setEventDate} />
          <FormField label="Time" value={time} onChangeText={setTime} placeholder="e.g. 7:00 PM" />
          <FormField label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" />

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
