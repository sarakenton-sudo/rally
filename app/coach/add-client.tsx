import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCoachStore } from '@/stores/useCoachStore';
import { useAuth } from '@/providers/AuthProvider';
import { coachAddClient, fetchClientGroups, createClientGroup, GROUP_COLORS, type AddClientResult } from '@/lib/coach';
import { POSITIONS, POSITION_LABEL, validateNewClient } from '@/lib/clientForm';
import { bookingPageUrl } from '@/lib/bookingPage';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError, tapLight } from '@/lib/haptics';
import { trackEvent } from '@/lib/track-event';
import { showToast } from '@/components/Toast';
import type { ClientGroup } from '@/types/database';

const SPORTS = ['Volleyball', 'Beach volleyball', 'Other'];

function Field({ label, value, onChangeText, placeholder, required, ...rest }: {
  label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; required?: boolean;
} & Partial<React.ComponentProps<typeof TextInput>>) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-semibold text-stone dark:text-parchment mb-1 ml-1">
        {label}{required ? <Text className="text-red-600"> *</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8FA8BF"
        className="bg-warm-white dark:bg-bark-light rounded-xl px-3.5 py-3 text-base text-bark dark:text-cream border border-parchment dark:border-rally-900"
        accessibilityLabel={label}
        {...rest}
      />
    </View>
  );
}

function Chip({ on, label, onPress, color = '#3B82B0' }: { on: boolean; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable
      onPress={() => { tapLight(); onPress(); }}
      className="rounded-full mr-2 mb-2 border"
      style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: on ? color : 'transparent', borderColor: on ? color : '#D8E2EC' }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text className="text-xs font-semibold" style={{ color: on ? '#fff' : '#3A5A7A' }}>{label}</Text>
    </Pressable>
  );
}

/** Coach → Add a client. Only parent email + athlete first name are required. */
export default function AddClientScreen() {
  const ic = useIconColors();
  const { user } = useAuth();
  const coach = useCoachStore((s) => s.coachProfile);

  const [athleteFirst, setAthleteFirst] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [more, setMore] = useState(false);
  const [athleteLast, setAthleteLast] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [sport, setSport] = useState('Volleyball');
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [club, setClub] = useState('');
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ result: AddClientResult; name: string; email: string; emailOk: boolean | null } | null>(null);

  useFocusEffect(useCallback(() => {
    if (coach) fetchClientGroups(coach.id).then(({ data }) => setGroups(data));
  }, [coach?.id]));

  const toggleGroup = (id: string) => setGroupIds((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));

  const addGroup = async () => {
    const name = newGroup.trim();
    if (!name || !coach) return;
    const { data, error: e } = await createClientGroup(coach.id, name);
    if (e || !data) { setError(`Couldn't create the group: ${e?.message ?? 'try again'}`); return; }
    setGroups((g) => [...g, data]);
    setGroupIds((g) => [...g, data.id]);
    setNewGroup('');
  };

  const reset = () => {
    setAthleteFirst(''); setParentEmail(''); setAthleteLast(''); setParentName(''); setParentPhone('');
    setSport('Volleyball'); setPrimary(''); setSecondary(''); setGradYear(''); setClub(''); setGroupIds([]);
    setMore(false); setError(null); setDone(null);
  };

  const save = async () => {
    const problem = validateNewClient({ parentEmail, athleteFirst, gradYear });
    if (problem) { setError(problem); notifyError(); return; }
    setError(null);
    setSaving(true);
    const { data, email, error: e } = await coachAddClient({
      parentEmail, athleteFirst, athleteLast, parentName, parentPhone,
      sport: sport === 'Other' ? '' : sport.toLowerCase(), primary, secondary, gradYear, club, groupIds,
    });
    setSaving(false);
    if (e || !data) { setError(e?.message ?? "Couldn't add the client. Try again."); notifyError(); return; }
    notifySuccess();
    if (user) trackEvent(user.id, 'coach_client_added', { status: data.status, has_groups: groupIds.length > 0 });
    setDone({ result: data, name: athleteFirst.trim(), email: parentEmail.trim().toLowerCase(), emailOk: null });
    // The email goes out in the background; update the message when it's sent.
    email.then((st) => setDone((d) => (d ? { ...d, emailOk: st === 202 || st === '202' } : d)));
  };

  const shareLink = async () => {
    const slug = coach?.slug;
    if (!slug) return;
    const msg = `Book lessons with me on RallyHUB: ${bookingPageUrl(slug)}`;
    if (Platform.OS === 'web') { await Clipboard.setStringAsync(msg); showToast('Link copied'); }
    else await Share.share({ message: msg });
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
          <Pressable onPress={() => router.back()} className="p-1" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">Add a client</Text>
          {done ? <View className="w-14" /> : (
            <Pressable onPress={save} disabled={saving} className={`px-4 py-1.5 rounded-lg ${saving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`} accessibilityLabel="Save client">
              <Text className="text-sm font-semibold text-cream">{saving ? 'Saving…' : 'Save'}</Text>
            </Pressable>
          )}
        </View>

        {done ? (
          <View className="flex-1 px-6 pt-10 items-center">
            <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: '#16a34a1a' }}>
              <Ionicons name="checkmark" size={30} color="#16a34a" />
            </View>
            <Text className="text-xl font-bold text-bark dark:text-cream text-center">{done.name} is a client</Text>
            <Text className="text-sm text-stone dark:text-parchment text-center mt-2 leading-5">
              {done.result.status === 'connected'
                ? `${done.email} is already on RallyHUB, so they're connected now. They'll sign your terms and release for ${done.name} before the first lesson.`
                : done.emailOk === null
                  ? `Saved. Sending ${done.email} an invite now. When they sign up with that email, ${done.name} attaches to their account automatically.`
                  : done.emailOk
                  ? `We emailed ${done.email} an invite. When they sign up with that email, ${done.name} attaches to their account automatically.`
                  : `Saved. We couldn't send the invite email just now — send them your booking link instead. When they sign up with ${done.email}, ${done.name} attaches automatically.`}
            </Text>
            {done.result.status === 'pending' && done.emailOk === false && coach?.slug ? (
              <Pressable onPress={shareLink} className="flex-row items-center rounded-xl px-4 py-3 mt-5 bg-rally-600 active:opacity-80">
                <Ionicons name="share-outline" size={16} color="#fff" />
                <Text className="text-sm font-bold text-white ml-1.5">Send my booking link</Text>
              </Pressable>
            ) : null}
            <View className="flex-row mt-6" style={{ gap: 10 }}>
              <Pressable onPress={reset} className="rounded-xl px-4 py-3 border border-rally-600 active:opacity-70">
                <Text className="text-sm font-bold text-rally-600">Add another</Text>
              </Pressable>
              {done.result.status === 'connected' ? (
                <Pressable
                  onPress={() => router.replace({ pathname: '/coach/client', params: { connectionId: (done.result as any).connection_id } })}
                  className="rounded-xl px-4 py-3 bg-rally-600 active:opacity-80"
                >
                  <Text className="text-sm font-bold text-white">Open client</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => router.back()} className="rounded-xl px-4 py-3 bg-rally-600 active:opacity-80">
                  <Text className="text-sm font-bold text-white">Done</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <Field label="Athlete first name" required value={athleteFirst} onChangeText={setAthleteFirst} placeholder="e.g. Maya" autoCapitalize="words" autoFocus />
            <Field label="Parent email" required value={parentEmail} onChangeText={setParentEmail} placeholder="parent@email.com"
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
            <Text className="text-xs text-stone dark:text-parchment -mt-1 mb-3 ml-1 leading-4">
              Already on RallyHUB? They're connected right away. If not, we email an invite and connect them when they sign up.
            </Text>

            {error ? (
              <View className="rounded-xl p-3 mb-3" style={{ backgroundColor: '#fee2e2' }}>
                <Text className="text-sm text-red-700">{error}</Text>
              </View>
            ) : null}

            <Pressable onPress={() => setMore(!more)} className="flex-row items-center py-2 mb-1" accessibilityLabel="More details">
              <Ionicons name={more ? 'chevron-down' : 'chevron-forward'} size={16} color="#3B82B0" />
              <Text className="text-sm font-semibold text-rally-600 ml-1">More details (optional)</Text>
            </Pressable>

            {more && (
              <>
                <Field label="Athlete last name" value={athleteLast} onChangeText={setAthleteLast} autoCapitalize="words" />
                <Field label="Parent name" value={parentName} onChangeText={setParentName} autoCapitalize="words" />
                <Field label="Parent phone" value={parentPhone} onChangeText={setParentPhone} keyboardType="phone-pad" />

                <Text className="text-xs font-semibold text-stone dark:text-parchment mb-1.5 ml-1">Sport</Text>
                <View className="flex-row flex-wrap mb-2">
                  {SPORTS.map((s) => <Chip key={s} on={sport === s} label={s} onPress={() => setSport(s)} />)}
                </View>

                <Text className="text-xs font-semibold text-stone dark:text-parchment mb-1.5 ml-1">Primary position</Text>
                <View className="flex-row flex-wrap mb-1">
                  {POSITIONS.map((p) => <Chip key={p} on={primary === p} label={`${p} · ${POSITION_LABEL[p]}`} onPress={() => setPrimary(primary === p ? '' : p)} />)}
                </View>
                <Field label="Other primary position" value={POSITIONS.includes(primary as any) ? '' : primary} onChangeText={setPrimary} placeholder="Type if not listed" />

                <Text className="text-xs font-semibold text-stone dark:text-parchment mb-1.5 ml-1">Secondary position</Text>
                <View className="flex-row flex-wrap mb-1">
                  {POSITIONS.map((p) => <Chip key={p} on={secondary === p} label={`${p} · ${POSITION_LABEL[p]}`} onPress={() => setSecondary(secondary === p ? '' : p)} />)}
                </View>
                <Field label="Other secondary position" value={POSITIONS.includes(secondary as any) ? '' : secondary} onChangeText={setSecondary} placeholder="Type if not listed" />

                <Field label="Grad year" value={gradYear} onChangeText={(v) => setGradYear(v.replace(/[^\d]/g, '').slice(0, 4))} placeholder={String(new Date().getFullYear() + 4)} keyboardType="number-pad" />
                <Field label="Club team" value={club} onChangeText={setClub} placeholder="e.g. Austin Juniors 14 Black" />
              </>
            )}

            {/* Groups are always visible: coaches asked for this up front */}
            <Text className="text-xs font-semibold text-stone dark:text-parchment mb-1.5 ml-1 mt-3">Groups</Text>
            <View className="flex-row flex-wrap mb-1">
              {groups.map((g, i) => (
                <Chip key={g.id} on={groupIds.includes(g.id)} label={g.name} color={GROUP_COLORS[i % GROUP_COLORS.length]} onPress={() => toggleGroup(g.id)} />
              ))}
            </View>
            <View className="flex-row items-center">
              <TextInput
                value={newGroup}
                onChangeText={setNewGroup}
                onSubmitEditing={addGroup}
                returnKeyType="done"
                placeholder="New group (e.g. Setters, Tuesday group)"
                placeholderTextColor="#8FA8BF"
                className="flex-1 bg-warm-white dark:bg-bark-light rounded-xl px-3 py-2.5 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
                accessibilityLabel="New group name"
              />
              <Pressable onPress={addGroup} disabled={!newGroup.trim()} className="ml-2 rounded-xl px-3 py-2.5" style={{ backgroundColor: newGroup.trim() ? '#0d9488' : '#0d948850' }}>
                <Text className="text-sm font-semibold text-white">Add</Text>
              </Pressable>
            </View>

            <Pressable onPress={save} disabled={saving} className={`rounded-xl py-3.5 items-center mt-6 ${saving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-base font-bold text-white">Add client</Text>}
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
