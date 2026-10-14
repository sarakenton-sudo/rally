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
import { fetchTeamEvent, fetchHomeVenue } from '@/lib/teamEvents';
import { updateTeamEvent, insertTeamEvent } from '@/hooks/useSupabaseData';
import { GAME_TIMES, GAME_ZONES, toLabel, fromLabel, deviceZone, zoneLabel, zoneFromLabel, zoneFromPlace } from '@/lib/gameTime';
import { getPref, setPref } from '@/lib/prefs';
import { useSeasonStore } from '@/stores/useSeasonStore';

const KINDS = ['Game', 'Team event'] as const;
const KIND_VALUE = { Game: 'game', 'Team event': 'event' } as const;
const SIDES = ['Not set', 'Home', 'Away'] as const;
const NO_TIME = 'No time yet';

const TZ_PREF = 'rally.gameTimezone';

/**
 * Add or edit a game / team event: team (when adding), type, opponent, home or
 * away, date, start time + time zone (remembered), venue search, notes.
 * Editing never moves a game to another team.
 */
export default function EditGameScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;
  const seasons = useSeasonStore((st) => st.seasons);
  const athletes = useSeasonStore((st) => st.athletes);
  const activeSeasonId = useSeasonStore((st) => st.activeSeasonId);
  const teamLabel = (sid: string) => {
    const se = seasons.find((x) => x.id === sid);
    const a = athletes.find((x) => x.id === se?.athlete_id);
    return se ? `${a ? `${a.first_name} · ` : ''}${se.team_name}` : '';
  };
  const [seasonId, setSeasonId] = useState<string>(activeSeasonId ?? seasons[0]?.id ?? '');
  const [zone, setZone] = useState<string>(deviceZone());
  const [zoneTouched, setZoneTouched] = useState(false);
  // Teams load after the screen on a fresh open: pick the active team then.
  useEffect(() => { if (isNew && !seasonId && (activeSeasonId || seasons[0])) setSeasonId(activeSeasonId ?? seasons[0].id); }, [activeSeasonId, seasons.length]);
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
  const [editSeasonId, setEditSeasonId] = useState<string | null>(null);

  useEffect(() => {
    // Last zone you picked (remembered on this device).
    getPref(TZ_PREF).then((tz) => { if (tz && isNew) setZone(tz); });
    if (isNew) { setLoading(false); return; }
    fetchTeamEvent(String(id)).then((g) => {
      if (g) {
        setEditSeasonId(g.season_id);
        if ((g as any).timezone) { setZone((g as any).timezone); setZoneTouched(true); } else getPref(TZ_PREF).then((tz) => tz && setZone(tz));
        setKind(g.event_type === 'game' ? 'Game' : 'Team event');
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

  // Home game with no location yet: use this team's usual home venue.
  const [homeFilled, setHomeFilled] = useState(false);
  const teamId = isNew ? seasonId : null;
  useEffect(() => {
    if (side !== 'Home' || venueName.trim() || loading) return;
    const sid = teamId ?? editSeasonId;
    if (!sid) return;
    fetchHomeVenue(sid).then((v) => {
      if (v && !venueName.trim()) { setVenueName(v.venue_name); setAddress(v.address); setHomeFilled(true); }
    });
  }, [side, seasonId, loading]);

  // Time zone follows the venue's state ("…, TX 78704" → Central) unless picked by hand.
  useEffect(() => {
    if (zoneTouched) return;
    const z = zoneFromPlace(address) ?? zoneFromPlace(venueName);
    if (z) setZone(z);
  }, [address, venueName, zoneTouched]);

  const isGame = kind === 'Game';
  const save = async () => {
    setError(null);
    if (isGame && !opponent.trim() && !name.trim()) { setError('Add the opponent (or a name).'); return; }
    if (!isGame && !name.trim()) { setError('Add a name.'); return; }
    if (!date) { setError('Pick a date.'); return; }
    if (isNew && !seasonId) { setError('Pick the team.'); return; }
    setSaving(true);
    setPref(TZ_PREF, zone);
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const fields = {
      event_type: KIND_VALUE[kind],
      opponent: isGame ? opponent.trim() || null : null,
      home_away: isGame && side !== 'Not set' ? side.toLowerCase() : null,
      name: name.trim() || (isGame ? `vs ${opponent.trim()}` : ''),
      date: ymd,
      time: time === NO_TIME ? null : fromLabel(time),
      timezone: time === NO_TIME ? null : zone,
      venue_name: venueName.trim(),
      address: address.trim(),
      notes: notes.trim() || null,
    };
    let { error: e } = isNew
      ? await insertTeamEvent({ ...fields, season_id: seasonId, tournament_id: null, reservation_name: null, reservation_number: null, party_size: null, family_welcome: true } as any)
      : await updateTeamEvent(String(id), fields as any);
    // Before the time-zone column exists (00104), save without it.
    if (e && /timezone/.test(e.message)) {
      const { timezone: _tz, ...rest } = fields;
      ({ error: e } = isNew
        ? await insertTeamEvent({ ...rest, season_id: seasonId, tournament_id: null, reservation_name: null, reservation_number: null, party_size: null, family_welcome: true } as any)
        : await updateTeamEvent(String(id), rest as any));
    }
    setSaving(false);
    if (e) { setError(e.message); return; }
    notifySuccess();
    if (!isNew) track('team_event_edited', { event_type: KIND_VALUE[kind] });
    showToast(isNew ? `${kind} added` : 'Saved');
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
          <Text className="text-lg font-bold text-bark dark:text-cream">{isNew ? 'Add' : 'Edit'} {kind === 'Game' ? 'game' : 'event'}</Text>
          <Pressable onPress={save} disabled={saving || loading} className="rounded-lg px-4 py-1.5 active:opacity-80" style={{ backgroundColor: CORAL }} accessibilityLabel="Save">
            <Text className="text-sm font-bold text-white">{saving ? 'Saving…' : 'Save'}</Text>
          </Pressable>
        </View>
        {loading ? <ActivityIndicator color={CORAL} className="mt-10" /> : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            {isNew && seasons.length > 0 ? (
              <DropdownField label="Team" value={teamLabel(seasonId)} options={seasons.map((x) => teamLabel(x.id))} onChange={(v) => { const se = seasons.find((x) => teamLabel(x.id) === v); if (se) setSeasonId(se.id); }} />
            ) : null}
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
            {time !== NO_TIME ? (
              <DropdownField label="Time zone" value={zoneLabel(zone)} options={GAME_ZONES.map((z) => z.label)} onChange={(v) => { const tz = zoneFromLabel(v); if (tz) { setZone(tz); setZoneTouched(true); } }} />
            ) : null}
            {homeFilled ? (
              <Text className="text-xs mb-2" style={{ color: CORAL }}>Filled in from this team's last home game. Change it if it's somewhere else.</Text>
            ) : null}
            <VenueSearchField name={venueName} onChangeName={setVenueName} address={address} onChangeAddress={setAddress} nameLabel="Location" addressLabel="Address" placeholder="Start typing, e.g. Westlake High School" />
            <FormField label="Notes" value={notes} onChangeText={setNotes} placeholder="e.g. Wear white jerseys" multiline />
            {error ? <Text className="text-sm text-red-600 mb-3">{error}</Text> : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
