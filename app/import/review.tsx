import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { insertTournament } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import DatePickerField from '@/components/DatePickerField';
import type { Tournament } from '@/types/database';
import { trackEvent } from '@/lib/track-event';
import TeamPicker, { useTeamChoice, resolveTeamChoice } from '@/components/TeamPicker';
import { useDataRefresh } from '@/providers/DataProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { currentSeasonLabel, seasonMatches } from '@/lib/seasons';
import { insertTeamEvent } from '@/hooks/useSupabaseData';
import { gameTitle, type ExtractedGame } from '@/lib/scheduleGames';

const fmtGameDate = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`);
  return isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
const fmtGameTime = (hhmm: string) => {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

interface ExtractedTournament {
  name: string;
  start_date: string;
  end_date: string;
  location_city: string;
  venue_name: string;
  venue_address: string;
  notes: string;
  schedule_link?: string;
  ticket_link?: string;
}

export default function PasteReviewScreen() {
  const { tournaments: raw, games: rawGames } = useLocalSearchParams<{ tournaments: string; games?: string }>();
  const parsed: ExtractedTournament[] = raw ? JSON.parse(raw) : [];
  const parsedGames: ExtractedGame[] = (() => { try { return rawGames ? JSON.parse(rawGames) : []; } catch { return []; } })();

  const ic = useIconColors();
  const [items, setItems] = useState<ExtractedTournament[]>(parsed);
  const [games, setGames] = useState<ExtractedGame[]>(parsedGames);
  const [editingGame, setEditingGame] = useState<number | null>(null);
  const [aesIds, setAesIds] = useState<Record<number, string>>({});
  const [scheduleLinks, setScheduleLinks] = useState<Record<number, string>>({});
  const [ticketLinks, setTicketLinks] = useState<Record<number, string>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const addTournament = useSeasonStore((s) => s.addTournament);
  const seasons = useSeasonStore((s) => s.seasons);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const setActiveSeasonId = useSeasonStore((s) => s.setActiveSeasonId);
  const { refresh } = useDataRefresh();
  const { user } = useAuth();
  // Which team these go to — guessed from the dates, never silently the active team.
  const allDates = [...items.map((i) => i.start_date), ...games.map((g) => g.date)];
  const { choice: teamChoice, setChoice: setTeamChoice } = useTeamChoice(allDates);

  // Track import attempt on mount
  useState(() => {
    if (user?.id) trackEvent(user.id, 'import_attempt', { type: 'tournament_paste', item_count: parsed.length, game_count: parsedGames.length });
  });

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

  const updateGame = useCallback((index: number, patch: Partial<ExtractedGame>) => {
    setGames((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }, []);

  const showError = (message: string) => {
    setErrorMsg(message);
    if (Platform.OS !== 'web') Alert.alert('Error', message);
  };

  const handleSaveAll = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (items.length === 0 && games.length === 0) {
      showError('Add at least one tournament or game to save.');
      return;
    }

    setIsSaving(true);

    try {
      const { seasonId, created, error: teamError } = await resolveTeamChoice(teamChoice);
      if (!seasonId) {
        showError(teamError ?? 'Choose a team for these tournaments.');
        return;
      }
      // A brand-new team for the season we're in right now becomes the active team.
      if (created && seasonMatches(created, currentSeasonLabel())) {
        setActiveSeasonId(created.id);
        if (adminConfig) {
          setAdminConfig({ ...adminConfig, active_season_id: created.id });
          await updateAdminConfig(adminConfig.id, { active_season_id: created.id });
        }
      }
      const teamName = created?.team_name ?? seasons.find((s) => s.id === seasonId)?.team_name ?? 'your team';

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const tournamentData = {
          season_id: seasonId,
          name: item.name,
          start_date: item.start_date,
          end_date: item.end_date,
          location_city: item.location_city,
          venues: item.venue_name
            ? [{ label: item.venue_name, address: item.venue_address || item.location_city, is_confirmed: false }]
            : [{ label: item.location_city, address: item.location_city, is_confirmed: false }],
          ticket_system: null,
          ticket_link: ticketLinks[i]?.trim() || item.ticket_link?.trim() || null,
          aes_tournament_id: aesIds[i]?.trim() || null,
          aes_feed_data: null,
          aes_feed_last_updated: null,
          aes_feed_available: false,
          schedule_link: scheduleLinks[i]?.trim() || item.schedule_link?.trim() || null,
          schedule_available_date: null,
          ticket_sales_date: null,
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
            showError(`Failed to save "${item.name}": ${error.message}`);
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

      // Games → team events of type 'game' (00084).
      for (const g of games) {
        const event = {
          tournament_id: null,
          name: gameTitle(g),
          date: g.date,
          time: g.start_time || null,
          venue_name: g.location || '',
          address: '',
          reservation_name: null,
          reservation_number: null,
          party_size: null,
          notes: [g.times && `Times: ${g.times}`, g.notes].filter(Boolean).join('\n') || null,
          family_welcome: true,
          season_id: seasonId,
          event_type: 'game',
          opponent: g.opponent || null,
          home_away: g.home_away || null,
        };
        if (isSupabaseConfigured && user) {
          const { error } = await insertTeamEvent(event as any);
          if (error) {
            showError(`Failed to save the game on ${fmtGameDate(g.date)}: ${error.message}`);
            setIsSaving(false);
            return;
          }
        }
      }

      if (user?.id) trackEvent(user.id, 'import_completed', { type: 'tournament_paste', item_count: items.length, game_count: games.length });
      notifySuccess();
      await refresh();
      const parts = [
        items.length ? `${items.length} tournament${items.length !== 1 ? 's' : ''}` : '',
        games.length ? `${games.length} game${games.length !== 1 ? 's' : ''}` : '',
      ].filter(Boolean).join(' and ');
      const msg = `${parts} added to ${teamName}.`;
      if (Platform.OS === 'web') {
        setSuccessMsg(msg);
        setTimeout(() => {
          try { router.dismissAll(); } catch { router.replace('/(tabs)/season'); }
        }, 1500);
      } else {
        Alert.alert('Imported!', msg, [{ text: 'OK', onPress: () => router.dismissAll() }]);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to save tournaments.');
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
          {games.length ? 'Review Schedule' : 'Add a Tournament'}
        </Text>
        <Pressable
          onPress={handleSaveAll}
          disabled={isSaving || (items.length === 0 && games.length === 0)}
          className={`px-4 py-1.5 rounded-lg ${
            isSaving || (items.length === 0 && games.length === 0) ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'
          }`}
        >
          <Text className="text-sm font-semibold text-cream">
            {isSaving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Error banner */}
        {errorMsg && (
          <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 mb-3 flex-row items-start">
            <Ionicons name="alert-circle" size={18} color="#dc2626" />
            <Text className="text-sm text-red-700 dark:text-red-300 ml-2 flex-1">{errorMsg}</Text>
          </View>
        )}

        {/* Success banner */}
        {successMsg && (
          <View className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 mb-3 flex-row items-start">
            <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
            <Text className="text-sm text-green-700 dark:text-green-300 ml-2 flex-1">{successMsg}</Text>
          </View>
        )}

        {/* Info banner */}
        <View className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 mb-4 flex-row items-start">
          <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          <Text className="text-sm text-green-700 dark:text-green-300 ml-2 flex-1">
            {[
              items.length ? `${items.length} tournament${items.length !== 1 ? 's' : ''}` : '',
              games.length ? `${games.length} game${games.length !== 1 ? 's' : ''}` : '',
            ].filter(Boolean).join(' and ') || 'Nothing'} found. Review and edit before saving.
          </Text>
        </View>

        <TeamPicker dates={allDates} choice={teamChoice} onChange={setTeamChoice} />

        {/* Games (single matches) */}
        {games.length > 0 && (
          <View className="mb-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">
              Games · {games.length}
            </Text>
            {games.map((g, index) => (
              <View key={`${g.date}-${index}`} className="bg-warm-white dark:bg-bark-light rounded-xl border border-parchment dark:border-rally-900 mb-2 p-3">
                <View className="flex-row items-start">
                  <View className="w-12 items-center mr-3">
                    <Text className="text-[10px] font-bold uppercase text-rally-600">{fmtGameDate(g.date).split(' ')[0]}</Text>
                    <Text className="text-xs font-semibold text-bark dark:text-cream">{fmtGameDate(g.date).split(' ').slice(1).join(' ')}</Text>
                  </View>
                  <View className="flex-1">
                    {editingGame === index ? (
                      <View className="gap-2">
                        <EditRow label="Opponent" value={g.opponent} onChange={(v) => updateGame(index, { opponent: v })} placeholder="e.g. Stony Point" />
                        <EditRow label="Location" value={g.location} onChange={(v) => updateGame(index, { location: v })} placeholder="School or gym" />
                        <EditRow label="Start time (24h)" value={g.start_time} onChange={(v) => updateGame(index, { start_time: v })} placeholder="17:00" />
                      </View>
                    ) : (
                      <>
                        <Text className="text-sm font-bold text-bark dark:text-cream">{gameTitle(g)}</Text>
                        <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                          {[fmtGameTime(g.start_time), g.location].filter(Boolean).join(' · ') || 'Time and place not listed'}
                        </Text>
                        {g.needs_review && g.times ? (
                          <Text className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">All times listed: {g.times}</Text>
                        ) : null}
                      </>
                    )}
                  </View>
                  {g.needs_review && editingGame !== index ? (
                    <View className="rounded-md px-1.5 py-0.5 mr-1" style={{ backgroundColor: '#FEF3C7' }}>
                      <Text className="text-[10px] font-bold" style={{ color: '#b45309' }}>CHECK</Text>
                    </View>
                  ) : null}
                  <Pressable onPress={() => setEditingGame(editingGame === index ? null : index)} className="p-1.5" accessibilityLabel={editingGame === index ? 'Done editing game' : 'Edit game'}>
                    <Ionicons name={editingGame === index ? 'checkmark' : 'create-outline'} size={18} color={editingGame === index ? '#16a34a' : '#8FA8BF'} />
                  </Pressable>
                  <Pressable onPress={() => setGames((prev) => prev.filter((_, i) => i !== index))} className="p-1.5" accessibilityLabel="Remove game">
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {items.length > 0 && games.length > 0 && (
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">
            Tournaments · {items.length}
          </Text>
        )}

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
                  <DatePickerField
                    label="Start Date"
                    value={item.start_date ? (() => { const d = new Date(item.start_date + 'T12:00:00'); return isNaN(d.getTime()) ? null : d; })() : null}
                    onChange={(d) => updateField(index, 'start_date', d ? d.toISOString().split('T')[0] : '')}
                  />
                  <DatePickerField
                    label="End Date"
                    value={item.end_date ? (() => { const d = new Date(item.end_date + 'T12:00:00'); return isNaN(d.getTime()) ? null : d; })() : null}
                    onChange={(d) => updateField(index, 'end_date', d ? d.toISOString().split('T')[0] : '')}
                  />
                  <EditRow label="City" value={item.location_city} onChange={(v) => updateField(index, 'location_city', v)} placeholder="City, ST" />
                  <EditRow label="Venue" value={item.venue_name} onChange={(v) => updateField(index, 'venue_name', v)} placeholder="Venue name" />
                  <EditRow label="Address" value={item.venue_address} onChange={(v) => updateField(index, 'venue_address', v)} placeholder="Full address" />
                  <EditRow label="Schedule Link" value={scheduleLinks[index] ?? item.schedule_link ?? ''} onChange={(v) => setScheduleLinks((prev) => ({ ...prev, [index]: v }))} placeholder="https://..." />
                  <EditRow label="Ticket Link" value={ticketLinks[index] ?? item.ticket_link ?? ''} onChange={(v) => setTicketLinks((prev) => ({ ...prev, [index]: v }))} placeholder="https://..." />
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

        {items.length === 0 && games.length === 0 && (
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
