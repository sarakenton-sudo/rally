import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { insertTournament } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { Tournament } from '@/types/database';

interface ExtractedTournament {
  name: string;
  start_date: string;
  end_date: string;
  location_city: string;
  venue_name: string;
  venue_address: string;
  notes: string;
}

export default function PasteReviewScreen() {
  const { tournaments: raw } = useLocalSearchParams<{ tournaments: string }>();
  const parsed: ExtractedTournament[] = raw ? JSON.parse(raw) : [];

  const ic = useIconColors();
  const [items, setItems] = useState<ExtractedTournament[]>(parsed);
  const [aesIds, setAesIds] = useState<Record<number, string>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const addTournament = useSeasonStore((s) => s.addTournament);
  const { user } = useAuth();

  const updateField = useCallback((index: number, field: keyof ExtractedTournament, value: string) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSaveAll = async () => {
    if (items.length === 0) {
      Alert.alert('No tournaments', 'Add at least one tournament to save.');
      return;
    }

    setIsSaving(true);

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const tournamentData = {
          user_id: user?.id ?? '00000000-0000-0000-0000-000000000001',
          name: item.name,
          start_date: item.start_date,
          end_date: item.end_date,
          location_city: item.location_city,
          venues: item.venue_name
            ? [{ label: item.venue_name, address: item.venue_address || item.location_city, is_confirmed: false }]
            : [{ label: item.location_city, address: item.location_city, is_confirmed: false }],
          ticket_system: null,
          ticket_link: null,
          aes_tournament_id: aesIds[i]?.trim() || null,
          aes_feed_data: null,
          aes_feed_last_updated: null,
          aes_feed_available: false,
          sportwrench_url: null,
          tickets_purchased: false,
          streaming_links: [],
          air_not_needed: false,
          hotel_not_needed: false,
          travel_required: true,
          status: 'upcoming' as const,
        };

        if (isSupabaseConfigured && user) {
          const { data, error } = await insertTournament(tournamentData);
          if (error) {
            Alert.alert('Save failed', `Failed to save "${item.name}": ${error.message}`);
            setIsSaving(false);
            return;
          }
          if (data) addTournament(data);
        } else {
          const tournament: Tournament = {
            ...tournamentData,
            id: `t-import-${Date.now()}-${i}`,
            created_at: new Date().toISOString(),
          };
          addTournament(tournament);
        }
      }

      notifySuccess();
      Alert.alert(
        'Imported!',
        `${items.length} tournament${items.length !== 1 ? 's' : ''} added to your season.`,
        [{ text: 'OK', onPress: () => router.dismissAll() }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save tournaments.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-warm-white dark:bg-bark border-b border-parchment dark:border-bark-light">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">
          Review ({items.length})
        </Text>
        <Pressable
          onPress={handleSaveAll}
          disabled={isSaving || items.length === 0}
          className={`px-4 py-1.5 rounded-lg ${
            isSaving || items.length === 0 ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'
          }`}
        >
          <Text className="text-sm font-semibold text-cream">
            {isSaving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Info banner */}
        <View className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 mb-4 flex-row items-start">
          <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          <Text className="text-sm text-green-700 dark:text-green-300 ml-2 flex-1">
            {items.length} tournament{items.length !== 1 ? 's' : ''} extracted. Review and edit before saving.
          </Text>
        </View>

        {items.map((item, index) => (
          <View
            key={index}
            className="bg-warm-white dark:bg-bark-light rounded-xl border border-parchment dark:border-rally-900 mb-3 overflow-hidden"
          >
            {/* Card header with color bar */}
            <View className="bg-rally-600 h-1.5" />

            <View className="p-4">
              {/* Top row: name + remove */}
              <View className="flex-row items-start justify-between mb-2">
                {editingIndex === index ? (
                  <TextInput
                    className="flex-1 text-base font-bold text-bark dark:text-cream bg-cream dark:bg-rally-900 rounded-lg px-3 py-2 mr-2"
                    value={item.name}
                    onChangeText={(v) => updateField(index, 'name', v)}
                    autoFocus
                  />
                ) : (
                  <Text className="flex-1 text-base font-bold text-bark dark:text-cream mr-2">
                    {item.name}
                  </Text>
                )}
                <View className="flex-row">
                  <Pressable
                    onPress={() => setEditingIndex(editingIndex === index ? null : index)}
                    className="p-1.5 mr-1"
                  >
                    <Ionicons
                      name={editingIndex === index ? 'checkmark' : 'create-outline'}
                      size={18}
                      color={editingIndex === index ? '#16a34a' : '#8FA8BF'}
                    />
                  </Pressable>
                  <Pressable onPress={() => removeItem(index)} className="p-1.5">
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </Pressable>
                </View>
              </View>

              {editingIndex === index ? (
                <View className="gap-3">
                  <EditRow label="Start Date" value={item.start_date} onChange={(v) => updateField(index, 'start_date', v)} placeholder="YYYY-MM-DD" />
                  <EditRow label="End Date" value={item.end_date} onChange={(v) => updateField(index, 'end_date', v)} placeholder="YYYY-MM-DD" />
                  <EditRow label="City" value={item.location_city} onChange={(v) => updateField(index, 'location_city', v)} placeholder="City, ST" />
                  <EditRow label="Venue" value={item.venue_name} onChange={(v) => updateField(index, 'venue_name', v)} placeholder="Venue name" />
                  <EditRow label="Address" value={item.venue_address} onChange={(v) => updateField(index, 'venue_address', v)} placeholder="Full address" />
                  <EditRow label="Notes" value={item.notes} onChange={(v) => updateField(index, 'notes', v)} placeholder="Notes" />
                </View>
              ) : (
                <View>
                  <View className="flex-row items-center mb-1.5">
                    <Ionicons name="calendar-outline" size={14} color={ic.muted} />
                    <Text className="text-sm text-stone dark:text-parchment ml-1.5">
                      {item.start_date}{item.end_date !== item.start_date ? ` → ${item.end_date}` : ''}
                    </Text>
                  </View>

                  <View className="flex-row items-center mb-1.5">
                    <Ionicons name="location-outline" size={14} color={ic.muted} />
                    <Text className="text-sm text-stone dark:text-parchment ml-1.5">
                      {item.location_city || 'No city'}
                    </Text>
                  </View>

                  {item.venue_name ? (
                    <View className="flex-row items-center mb-1.5">
                      <Ionicons name="business-outline" size={14} color={ic.muted} />
                      <Text className="text-sm text-stone dark:text-parchment ml-1.5">
                        {item.venue_name}
                      </Text>
                    </View>
                  ) : null}

                  {item.notes ? (
                    <Text className="text-xs text-stone italic mt-1">{item.notes}</Text>
                  ) : null}
                </View>
              )}

              {/* AES ID input */}
              <View className="mt-3 pt-3 border-t border-parchment dark:border-rally-900">
                <View className="flex-row items-center">
                  <Text className="text-xs text-stone mr-2">AES ID</Text>
                  <TextInput
                    className="flex-1 bg-cream dark:bg-rally-900 rounded-lg px-3 py-1.5 text-xs text-bark dark:text-parchment"
                    placeholder="Optional — e.g. AJV-2026-001"
                    placeholderTextColor="#8FA8BF"
                    value={aesIds[index] || ''}
                    onChangeText={(v) => setAesIds((prev) => ({ ...prev, [index]: v }))}
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            </View>
          </View>
        ))}

        {items.length === 0 && (
          <View className="items-center py-16">
            <Ionicons name="document-text-outline" size={48} color={ic.placeholder} />
            <Text className="text-lg font-semibold text-stone mt-4">No tournaments</Text>
            <Text className="text-sm text-stone mt-1">All extracted tournaments were removed.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EditRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View>
      <Text className="text-xs text-stone mb-1">{label}</Text>
      <TextInput
        className="bg-cream dark:bg-rally-900 rounded-lg px-3 py-2 text-sm text-bark dark:text-cream"
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#8FA8BF"
      />
    </View>
  );
}
