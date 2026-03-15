import { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateTournament as updateTournamentDB } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { ExtractedTournamentDetails } from '@/lib/tournament-detail-parser';

export default function ReviewTournamentDetailsScreen() {
  const { details: raw, tournamentId: preselectedId } = useLocalSearchParams<{
    details: string;
    tournamentId?: string;
  }>();
  const parsed: ExtractedTournamentDetails = raw ? JSON.parse(raw) : {};

  const ic = useIconColors();
  const [fields, setFields] = useState<ExtractedTournamentDetails>(parsed);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>(preselectedId || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const tournaments = useSeasonStore((s) => s.tournaments);
  const updateTournamentStore = useSeasonStore((s) => s.updateTournament);
  const { user } = useAuth();

  const tournamentOptions = useMemo(
    () => tournaments.map((t) => t.name),
    [tournaments]
  );

  const selectedTournament = useMemo(
    () => tournaments.find((t) => t.id === selectedTournamentId),
    [tournaments, selectedTournamentId]
  );

  const selectedName = selectedTournament?.name ?? '';

  const handleTournamentChange = (name: string) => {
    const t = tournaments.find((tour) => tour.name === name);
    if (t) setSelectedTournamentId(t.id);
  };

  const updateField = (field: keyof ExtractedTournamentDetails, value: string) => {
    setFields((prev) => ({ ...prev, [field]: value }));
  };

  const showError = (msg: string) => {
    if (Platform.OS === 'web') {
      setErrorMsg(msg);
    } else {
      Alert.alert('Error', msg);
    }
  };

  const handleSave = async () => {
    if (!selectedTournamentId) {
      showError('Please select a tournament to update.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const updates: Record<string, any> = {};

      // Build venue update
      if (fields.venue_name || fields.venue_address) {
        const existingVenues = selectedTournament?.venues || [];
        const newVenue = {
          label: fields.venue_name || fields.location_city || '',
          address: fields.venue_address || fields.location_city || '',
          is_confirmed: true,
        };
        // Replace venues if we have new data, otherwise keep existing
        if (existingVenues.length === 0 || (existingVenues.length === 1 && !existingVenues[0].address)) {
          updates.venues = [newVenue];
        } else {
          // Add as confirmed venue
          updates.venues = [newVenue, ...existingVenues.filter((v) =>
            v.label !== newVenue.label && v.address !== newVenue.address
          )];
        }
      }

      if (fields.location_city) updates.location_city = fields.location_city;
      if (fields.ticket_sales_date) updates.ticket_sales_date = fields.ticket_sales_date;
      if (fields.ticket_link) updates.ticket_link = fields.ticket_link;
      if (fields.ticket_system) updates.ticket_system = fields.ticket_system;
      if (fields.schedule_link) updates.schedule_link = fields.schedule_link;
      if (fields.schedule_available_date) updates.schedule_available_date = fields.schedule_available_date;

      if (Object.keys(updates).length === 0) {
        showError('No details to update. Fill in at least one field.');
        return;
      }

      if (isSupabaseConfigured && user) {
        const { error } = await updateTournamentDB(selectedTournamentId, updates);
        if (error) {
          showError(`Failed to update: ${error.message}`);
          setIsSaving(false);
          return;
        }
      }
      updateTournamentStore(selectedTournamentId, updates);

      notifySuccess();
      router.dismissAll();
    } catch (err: any) {
      showError(err.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-warm-white border-b border-parchment">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark">
          Review Details
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={isSaving || !selectedTournamentId}
          className={`px-4 py-1.5 rounded-lg ${
            isSaving || !selectedTournamentId ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'
          }`}
        >
          <Text className="text-sm font-semibold text-cream">
            {isSaving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Info banner */}
        <View className="bg-green-50 rounded-xl p-3 mb-4 flex-row items-start">
          <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          <Text className="text-sm text-green-700 ml-2 flex-1">
            Details extracted. Select a tournament to update, review the fields, then save.
          </Text>
        </View>

        {/* Error */}
        {errorMsg && (
          <View className="bg-red-50 rounded-xl p-3 mb-4 flex-row items-start">
            <Ionicons name="alert-circle" size={18} color="#dc2626" />
            <Text className="text-sm text-red-700 ml-2 flex-1">{errorMsg}</Text>
          </View>
        )}

        {/* Tournament selector */}
        <View className="bg-warm-white rounded-xl border border-parchment mb-4 overflow-hidden">
          <View className="h-1.5 bg-rally-600" />
          <View className="p-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2">
              Update Tournament
            </Text>
            {tournamentOptions.length > 0 ? (
              <DropdownField
                label="Select Tournament"
                value={selectedName}
                options={tournamentOptions}
                onChange={handleTournamentChange}
              />
            ) : (
              <View className="bg-amber-50 rounded-xl p-3">
                <Text className="text-sm text-amber-700">
                  No tournaments yet. Add tournaments first, then import details.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Extracted fields */}
        <View className="bg-warm-white rounded-xl border border-parchment overflow-hidden">
          <View className="h-1.5 bg-green-500" />
          <View className="p-4">
            <View className="flex-row items-center mb-3">
              <Ionicons name="sparkles" size={16} color="#16a34a" />
              <Text className="text-xs font-semibold uppercase tracking-wider text-stone ml-2">
                Extracted Details
              </Text>
            </View>

            {/* Venue */}
            <Text className="text-sm font-bold text-bark mt-2 mb-1">Venue</Text>
            <FormField
              label="Venue Name"
              value={fields.venue_name}
              onChangeText={(v) => updateField('venue_name', v)}
              placeholder="e.g. Convention Center"
            />
            <FormField
              label="Address"
              value={fields.venue_address}
              onChangeText={(v) => updateField('venue_address', v)}
              placeholder="Full street address"
            />
            <FormField
              label="City"
              value={fields.location_city}
              onChangeText={(v) => updateField('location_city', v)}
              placeholder="City, ST"
            />

            {/* Tickets */}
            <Text className="text-sm font-bold text-bark mt-4 mb-1">Tickets</Text>
            <FormField
              label="Ticket Sales Date"
              value={fields.ticket_sales_date}
              onChangeText={(v) => updateField('ticket_sales_date', v)}
              placeholder="YYYY-MM-DD"
            />
            <FormField
              label="Ticket Link"
              value={fields.ticket_link}
              onChangeText={(v) => updateField('ticket_link', v)}
              placeholder="https://..."
            />
            <FormField
              label="Ticket System"
              value={fields.ticket_system}
              onChangeText={(v) => updateField('ticket_system', v)}
              placeholder="e.g. Electronic, Eventbrite"
            />

            {/* Schedule */}
            <Text className="text-sm font-bold text-bark mt-4 mb-1">Schedule</Text>
            <FormField
              label="Schedule Link"
              value={fields.schedule_link}
              onChangeText={(v) => updateField('schedule_link', v)}
              placeholder="https://..."
            />
            <FormField
              label="Schedule Available Date"
              value={fields.schedule_available_date}
              onChangeText={(v) => updateField('schedule_available_date', v)}
              placeholder="YYYY-MM-DD or description"
            />

            {/* Notes */}
            {fields.notes ? (
              <>
                <Text className="text-sm font-bold text-bark mt-4 mb-1">Notes</Text>
                <FormField
                  label="Extracted Notes"
                  value={fields.notes}
                  onChangeText={(v) => updateField('notes', v)}
                  placeholder="Additional info"
                />
              </>
            ) : null}

            {/* Division */}
            {fields.division_info ? (
              <>
                <Text className="text-sm font-bold text-bark mt-4 mb-1">Division</Text>
                <Text className="text-sm text-stone bg-cream rounded-lg px-3 py-2">
                  {fields.division_info}
                </Text>
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
