import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import DatePickerField from '@/components/DatePickerField';
import VenueSearchField from '@/components/VenueSearchField';
import { showToast } from '@/components/Toast';
import { useIconColors, CORAL } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import { track } from '@/lib/track-event';
import { fetchTeamEvent } from '@/lib/teamEvents';
import { updateTeamEvent } from '@/hooks/useSupabaseData';
import { GAME_TIMES, toLabel, fromLabel } from '@/lib/gameTime';

const KINDS = ['Game', 'Team event', 'Practice'] as const;
const KIND_VALUE = { Game: 'game', 'Team event': 'event', Practice: 'practice' } as const;
const SIDES = ['Not set', 'Home', 'Away'] as const;
const NO_TIME = 'No time yet';

/** Edit a game or team event: what, who, when, where, notes. Team stays the same. */
export default function EditGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ic = useIconColors();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kind, setKind] = useState<(typeof KINDS)[number]>('Game');
  const [opponent, setOpponent] = useState('');
  const [side, setSide] = useState<(typeof SIDES)[number]>('Not set');
  const [name, setName] = useState('');
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState(NO_TIME);
  const [venueName, setVenueName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTeamEvent(String(id)).then((g) => {
      if (g) {
        setKind(g.event_type === 'practice' ? 'Practice' : g.event_type === 'event' ? 'Team event' : 'Game');
        setOpponent(g.opponent ?? '');
        setSide(g.home_away === 'home' ? 'Home' : g.home_away === 'away' ? 'Away' : 'Not set');
        setName(g.name ?? '');
        setDate(g.date ? new Date(`${g.date}T12:00:00`) : null);
        setTime(toLabel(g.time) || NO_TIME);
        setVenueName(g.venue_name ?? '');
        setAddress(g.address ?? '');
        setNotes(g.notes ?? '');
      }
      setLoading(false);
    });
  }, [id]);

  const isGame = kind === 'Game';
  const save = async () => {
    setError(null);
    if (isGame && !opponent.trim() && !name.trim()) { setError('Add the opponent (or a name).'); return; }
    if (!isGame && !name.trim()) { setError('Add a name.'); return; }
    if (!date) { setError('Pick a date.'); return; }
    setSaving(true);
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const { error: e } = await updateTeamEvent(String(id), {
      event_type: KIND_VALUE[kind],
      opponent: isGame ? opponent.trim() || null : null,
      home_away: isGame && side !== 'Not set' ? side.toLowerCase() : null,
      name: name.trim() || (isGame ? `vs ${opponent.trim()}` : ''),
      date: ymd,
      time: time === NO_TIME ? null : fromLabel(time),
      venue_name: venueName.trim(),
      address: address.trim(),
      notes: notes.trim() || null,
    } as any);
    setSaving(false);
    if (e) { setError(e.message); return; }
    notifySuccess();
    track('team_event_edited', { event_type: KIND_VALUE[kind] });
    showToast('Saved');
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
          <Pressable onPress={() => router.back()} className="p-1" accessibilityLabel="Cancel">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">Edit {kind === 'Game' ? 'game' : kind === 'Practice' ? 'practice' : 'event'}</Text>
          <Pressable onPress={save} disabled={saving || loading} className="rounded-lg px-4 py-1.5 active:opacity-80" style={{ backgroundColor: CORAL }} accessibilityLabel="Save">
            <Text className="text-sm font-bold text-white">{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
        {loading ? <ActivityIndicator color={CORAL} className="mt-10" /> : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            <DropdownField label="Type" value={kind} options={[...KINDS]} onChange={(v) => setKind(v as any)} />
            {isGame ? (
              <>
                <FormField label="Opponent" value={opponent} onChangeText={setOpponent} placeholder="e.g. Westlake" />
                <DropdownField label="Home or away" value={side} options={[...SIDES]} onChange={(v) => setSide(v as any)} />
              </>
            ) : null}
            <FormField label={isGame ? 'Name (optional)' : 'Name'} value={name} onChangeText={setName} placeholder={isGame ? 'e.g. District opener' : 'e.g. Team dinner'} />
            <DatePickerField label="Date" value={date} onChange={setDate} />
            <DropdownField label="Start time" value={time} options={[NO_TIME, ...GAME_TIMES]} onChange={setTime} />
            <VenueSearchField name={venueName} onChangeName={setVenueName} address={address} onChangeAddress={setAddress} nameLabel="Location" addressLabel="Address" placeholder="Start typing, e.g. Westlake High School" />
            <FormField label="Notes" value={notes} onChangeText={setNotes} placeholder="e.g. Wear white jerseys" multiline />
            {error ? <Text className="text-sm text-red-600 mb-3">{error}</Text> : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
