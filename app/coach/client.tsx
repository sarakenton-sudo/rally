import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCoachStore } from '@/stores/useCoachStore';
import {
  fetchClientRoster, fetchClientGroups, createClientGroup, addGroupMember, removeGroupMember,
  clientDisplayName, GROUP_COLORS, isSupabaseConfigured, fmtMoney, PAYMENT_BADGE_STYLE,
  fetchAcceptances, latestAcceptances, fetchClientLessons, coachUpdateClient, coachUpdateClientAthlete, requestReleaseSignature,
  type RosterClient, type ClientAthlete, type ClientLesson, type PolicyAcceptance, type PaymentBadge,
} from '@/lib/coach';
import { POSITIONS, releaseLabel } from '@/lib/clientForm';
import type { ClientGroup } from '@/types/database';
import { useIconColors } from '@/lib/colors';
import SignedDocumentsList from '@/components/SignedDocumentsList';
import HealthInfo from '@/components/coach/HealthInfo';
import { showToast } from '@/components/Toast';
import { tapLight, notifySuccess, notifyError } from '@/lib/haptics';
import Avatar from '@/components/Avatar';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtHeight = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;

/** Payment state of a past/future lesson, for the big pill. */
function lessonBadge(l: ClientLesson): PaymentBadge | 'cancelled' {
  if (l.status === 'cancelled') return 'cancelled';
  if (l.payment_status === 'captured') return 'paid';
  if (l.payment_status === 'processing') return 'processing';
  if (l.payment_status === 'refunded') return 'refunded';
  if (l.payment_status === 'failed') return 'failed';
  return new Date(l.starts_at).getTime() < Date.now() ? 'overdue' : 'unpaid';
}

function Input({ label, value, onChangeText, ...rest }: { label: string; value: string; onChangeText: (v: string) => void } & Partial<React.ComponentProps<typeof TextInput>>) {
  return (
    <View className="mb-2.5">
      <Text className="text-[11px] font-semibold text-stone dark:text-parchment mb-1 ml-0.5">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#8FA8BF"
        className="bg-cream dark:bg-bark rounded-lg px-3 py-2.5 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
        accessibilityLabel={label}
        {...rest}
      />
    </View>
  );
}

function PositionChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View className="flex-row flex-wrap mb-1">
      {POSITIONS.map((p) => {
        const on = value === p;
        return (
          <Pressable key={p} onPress={() => onChange(on ? '' : p)} className="rounded-full mr-1.5 mb-1.5 border"
            style={{ paddingHorizontal: 10, paddingVertical: 5, backgroundColor: on ? '#3B82B0' : 'transparent', borderColor: on ? '#3B82B0' : '#D8E2EC' }}>
            <Text className="text-xs font-semibold" style={{ color: on ? '#fff' : '#3A5A7A' }}>{p}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One athlete on the client: view, or edit (name, sport, positions, grad year, club). */
function AthleteCard({ a, connectionId, onSaved }: { a: ClientAthlete; connectionId: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({
    first: a.first_name, last: a.last_name ?? '', sport: a.sport ?? 'volleyball',
    primary: a.positions?.[0] ?? '', secondary: a.positions?.[1] ?? '', gradYear: a.grad_year ? String(a.grad_year) : '', club: a.club_team ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const rel = releaseLabel(a.release);

  const save = async () => {
    if (!f.first.trim()) { setErr('First name is required.'); return; }
    setBusy(true); setErr(null);
    const { error } = await coachUpdateClientAthlete(connectionId, a.id, f);
    setBusy(false);
    if (error) { setErr(`Couldn't save: ${error.message}`); notifyError(); return; }
    notifySuccess(); setEditing(false); onSaved();
  };

  const requestSignature = async () => {
    tapLight(); setBusy(true);
    const { error, emailStatus, pushed } = await requestReleaseSignature(connectionId, a.id);
    setBusy(false);
    if (error) { showToast("Couldn't send the request. Try again."); return; }
    setRequested(true);
    const emailed = emailStatus === 202 || emailStatus === '202';
    showToast(emailed || pushed ? `Signature request sent for ${a.first_name}` : 'Saved to their RallyHUB notifications (email is down right now)');
  };

  const facts = [
    a.sport ? a.sport[0].toUpperCase() + a.sport.slice(1) : null,
    a.positions?.length ? a.positions.join(' / ') : null,
    a.grad_year ? `Class of ${a.grad_year}` : null,
    a.height_inches ? fmtHeight(a.height_inches) : null,
    a.level,
    a.club_team,
  ].filter(Boolean) as string[];

  return (
    <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2">
      <View className="flex-row items-center">
        <Text className="text-base font-bold text-bark dark:text-cream flex-1">{a.first_name}{a.last_name ? ` ${a.last_name}` : ''}</Text>
        {!editing && (
          <Pressable onPress={() => setEditing(true)} hitSlop={8} accessibilityLabel={`Edit ${a.first_name}`}>
            <Text className="text-xs font-semibold text-rally-600">Edit</Text>
          </Pressable>
        )}
      </View>

      {editing ? (
        <View className="mt-3">
          <View className="flex-row" style={{ gap: 8 }}>
            <View className="flex-1"><Input label="First name" value={f.first} onChangeText={(v) => setF({ ...f, first: v })} /></View>
            <View className="flex-1"><Input label="Last name" value={f.last} onChangeText={(v) => setF({ ...f, last: v })} /></View>
          </View>
          <Input label="Sport" value={f.sport} onChangeText={(v) => setF({ ...f, sport: v })} autoCapitalize="none" />
          <Text className="text-[11px] font-semibold text-stone dark:text-parchment mb-1 ml-0.5">Primary position</Text>
          <PositionChips value={f.primary} onChange={(v) => setF({ ...f, primary: v })} />
          <Text className="text-[11px] font-semibold text-stone dark:text-parchment mb-1 ml-0.5">Secondary position</Text>
          <PositionChips value={f.secondary} onChange={(v) => setF({ ...f, secondary: v })} />
          <View className="flex-row" style={{ gap: 8 }}>
            <View className="flex-1"><Input label="Grad year" value={f.gradYear} onChangeText={(v) => setF({ ...f, gradYear: v.replace(/[^\d]/g, '').slice(0, 4) })} keyboardType="number-pad" /></View>
            <View className="flex-1"><Input label="Club team" value={f.club} onChangeText={(v) => setF({ ...f, club: v })} /></View>
          </View>
          {err ? <Text className="text-xs text-red-700 mb-2">{err}</Text> : null}
          <View className="flex-row">
            <Pressable onPress={save} disabled={busy} className="rounded-lg px-4 py-2 mr-2 bg-rally-600 active:opacity-80">
              <Text className="text-xs font-bold text-white">{busy ? 'Saving…' : 'Save'}</Text>
            </Pressable>
            <Pressable onPress={() => { setEditing(false); setErr(null); }} className="rounded-lg px-4 py-2">
              <Text className="text-xs font-semibold text-stone">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {facts.length > 0 && (
            <View className="flex-row flex-wrap mt-2">
              {facts.map((x) => (
                <View key={x} className="bg-rally-50 dark:bg-rally-900/30 rounded-md px-2 py-1 mr-1.5 mb-1.5">
                  <Text className="text-xs font-medium text-rally-700 dark:text-rally-200">{x}</Text>
                </View>
              ))}
            </View>
          )}
          {a.goals ? <Text className="text-sm text-bark dark:text-cream mt-1">Goals: {a.goals}</Text> : null}

          {/* Release for this athlete */}
          <View className="flex-row items-center mt-2.5 pt-2.5 border-t border-parchment dark:border-rally-900">
            <Ionicons name={rel.ok ? 'document-text' : 'alert-circle-outline'} size={15} color={rel.ok ? '#16a34a' : '#b45309'} />
            <Text className="text-xs ml-1.5 flex-1" style={{ color: rel.ok ? '#15803d' : '#b45309' }}>
              Release: {rel.text}{a.athlete_signed_at ? ` · ${a.first_name} co-signed` : ''}
            </Text>
            {!rel.ok && (
              <Pressable onPress={requestSignature} disabled={busy || requested} className="rounded-lg px-2.5 py-1 border border-rally-600 ml-2 active:opacity-70"
                accessibilityLabel={`Request signature for ${a.first_name}`}>
                <Text className="text-[11px] font-bold text-rally-600">{requested ? 'Requested' : 'Request signature'}</Text>
              </Pressable>
            )}
          </View>

          {/* Health: an FYI, not the headline */}
          <HealthInfo allergies={a.allergies} ecName={a.emergency_contact_name} ecPhone={a.emergency_contact_phone} />
        </>
      )}
    </View>
  );
}

export default function CoachClientScreen() {
  const ic = useIconColors();
  const { connectionId } = useLocalSearchParams<{ connectionId: string }>();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const [client, setClient] = useState<RosterClient | null>(null);
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [lessons, setLessons] = useState<ClientLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState('');
  const [signedDocs, setSignedDocs] = useState<PolicyAcceptance[]>([]);
  const [editingParent, setEditingParent] = useState(false);
  const [pf, setPf] = useState({ parentName: '', parentPhone: '', parentEmail: '', notes: '' });
  const [savingParent, setSavingParent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!coachProfile || !isSupabaseConfigured) { setLoading(false); return; }
    const [r, g, ls] = await Promise.all([fetchClientRoster(), fetchClientGroups(coachProfile.id), fetchClientLessons(connectionId)]);
    const found = r.data.find((c) => c.connection_id === connectionId) ?? null;
    setClient(found);
    setLessons(ls);
    if (found) {
      setPf({ parentName: found.parent_name ?? '', parentPhone: found.parent_phone ?? '', parentEmail: found.parent_email ?? '', notes: found.coach_notes ?? '' });
      const docs = await fetchAcceptances({ coachId: coachProfile.id, athleteIds: found.athletes.map((a) => a.id) });
      setSignedDocs(latestAcceptances(docs.data));
    }
    setGroups(g.data);
    setLoading(false);
  }, [coachProfile, connectionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setMembership = (groupId: string, member: boolean) =>
    setClient((c) => c && ({ ...c, group_ids: member ? [...c.group_ids, groupId] : c.group_ids.filter((id) => id !== groupId) }));

  const toggleGroup = async (groupId: string) => {
    if (!client) return;
    const member = client.group_ids.includes(groupId);
    tapLight();
    setBusyGroup(groupId);
    setMembership(groupId, !member); // optimistic
    const { error: e } = member ? await removeGroupMember(groupId, client.connection_id) : await addGroupMember(groupId, client.connection_id);
    if (e) { setMembership(groupId, member); setError(`Couldn't update group: ${e.message}`); notifyError(); }
    setBusyGroup(null);
  };

  const addToNewGroup = async () => {
    const name = newGroup.trim();
    if (!name || !coachProfile || !client) return;
    setBusyGroup('new');
    const { data, error: e } = await createClientGroup(coachProfile.id, name);
    if (e || !data) { setError(`Couldn't create group: ${e?.message ?? 'try again'}`); notifyError(); }
    else {
      setGroups((g) => [...g, data]);
      const { error: addErr } = await addGroupMember(data.id, client.connection_id);
      if (!addErr) setMembership(data.id, true);
      setNewGroup('');
      notifySuccess();
    }
    setBusyGroup(null);
  };

  const saveParent = async () => {
    if (!client) return;
    setSavingParent(true); setError(null);
    const { error: e } = await coachUpdateClient(client.connection_id, pf);
    setSavingParent(false);
    if (e) { setError(`Couldn't save: ${e.message}`); notifyError(); return; }
    notifySuccess(); setEditingParent(false); load();
  };

  const name = client ? clientDisplayName(client) : '';
  const unpaid = lessons.filter((l) => ['overdue', 'failed'].includes(lessonBadge(l))).length;

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Client</Text>
        <View className="w-6" />
      </View>

      {loading ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : !client ? (
        <Text className="text-sm text-stone text-center mt-8">Client not found.</Text>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View className="items-center mb-4">
            <View className="mb-2">
              <Avatar uri={client.athletes.find((x) => x.photo_url)?.photo_url} name={name} size={64} colorKey={client.connection_id} />
            </View>
            <Text className="text-xl font-bold text-bark dark:text-cream text-center">{name}</Text>
            <Text className="text-xs text-stone dark:text-parchment mt-0.5">Client since {fmtDate(client.connected_at)}</Text>
          </View>

          {error ? (
            <View className="rounded-xl p-3 mb-3" style={{ backgroundColor: '#fee2e2' }}>
              <Text className="text-sm text-red-700">{error}</Text>
            </View>
          ) : null}

          {/* Stats — money first */}
          <View className="flex-row mb-4">
            {[
              { label: 'Unpaid', value: String(unpaid), color: unpaid ? '#dc2626' : '#16a34a' },
              { label: 'Lessons', value: String(client.lessons_booked), color: '#3B82B0' },
              { label: 'Next', value: client.next_lesson_at ? new Date(client.next_lesson_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—', color: '#1E3A5F' },
            ].map((s) => (
              <View key={s.label} className="flex-1 rounded-xl py-3 mx-1 items-center" style={{ backgroundColor: s.color + '12' }}>
                <Text className="text-lg font-bold" style={{ color: s.color }}>{s.value}</Text>
                <Text className="text-[11px] font-semibold text-stone dark:text-parchment">{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Lessons with payment status as the headline */}
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Lessons</Text>
          <View className="bg-warm-white dark:bg-bark-light rounded-xl border border-parchment dark:border-rally-900 mb-4 overflow-hidden">
            {lessons.length === 0 ? (
              <Text className="text-sm text-stone dark:text-parchment p-4">No lessons yet.</Text>
            ) : lessons.slice(0, 10).map((l, i) => {
              const b = lessonBadge(l);
              const st = b === 'cancelled' ? { label: 'CANCELLED', bg: '#8FA8BF26', fg: '#6B8BA8' } : PAYMENT_BADGE_STYLE[b];
              return (
                <View key={l.booking_id} className={`flex-row items-center px-4 py-3 ${i ? 'border-t border-parchment dark:border-rally-900' : ''}`}>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-bark dark:text-cream">{fmtDate(l.starts_at)}{l.athlete_first_name ? ` · ${l.athlete_first_name}` : ''}</Text>
                    <Text className="text-xs text-stone dark:text-parchment mt-0.5">{l.session_type ?? 'Lesson'} · {fmtMoney(l.price_cents)}{l.payment_method && b === 'paid' ? ` · ${l.payment_method}` : ''}</Text>
                  </View>
                  <View className="rounded-lg px-3 py-1.5" style={{ backgroundColor: st.bg }}>
                    <Text className="text-xs font-extrabold" style={{ color: st.fg }}>{st.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Parent (coach-side contact, editable) */}
          <View className="flex-row items-center mb-2 ml-1">
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone flex-1">Parent</Text>
            {!editingParent && (
              <Pressable onPress={() => setEditingParent(true)} hitSlop={8} accessibilityLabel="Edit parent">
                <Text className="text-xs font-semibold text-rally-600 mr-1">Edit</Text>
              </Pressable>
            )}
          </View>
          <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
            {editingParent ? (
              <>
                <Input label="Name" value={pf.parentName} onChangeText={(v) => setPf({ ...pf, parentName: v })} autoCapitalize="words" />
                <Input label="Phone" value={pf.parentPhone} onChangeText={(v) => setPf({ ...pf, parentPhone: v })} keyboardType="phone-pad" />
                <Input label="Email" value={pf.parentEmail} onChangeText={(v) => setPf({ ...pf, parentEmail: v })} keyboardType="email-address" autoCapitalize="none" />
                <Input label="Your notes (only you see these)" value={pf.notes} onChangeText={(v) => setPf({ ...pf, notes: v })} multiline style={{ minHeight: 70, textAlignVertical: 'top' }} />
                <View className="flex-row">
                  <Pressable onPress={saveParent} disabled={savingParent} className="rounded-lg px-4 py-2 mr-2 bg-rally-600 active:opacity-80">
                    <Text className="text-xs font-bold text-white">{savingParent ? 'Saving…' : 'Save'}</Text>
                  </Pressable>
                  <Pressable onPress={() => setEditingParent(false)} className="rounded-lg px-4 py-2">
                    <Text className="text-xs font-semibold text-stone">Cancel</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text className="text-sm font-semibold text-bark dark:text-cream">{client.parent_name || 'Name not set'}</Text>
                {client.parent_email ? (
                  <Pressable onPress={() => Linking.openURL(`mailto:${client.parent_email}`)} className="flex-row items-center mt-1.5">
                    <Ionicons name="mail-outline" size={14} color="#3B82B0" />
                    <Text className="text-sm text-rally-600 ml-1.5">{client.parent_email}</Text>
                  </Pressable>
                ) : null}
                {client.parent_phone ? (
                  <Pressable onPress={() => Linking.openURL(`sms:${client.parent_phone!.replace(/[^\d+]/g, '')}`)} className="flex-row items-center mt-1.5">
                    <Ionicons name="chatbubble-outline" size={14} color="#3B82B0" />
                    <Text className="text-sm text-rally-600 ml-1.5">{client.parent_phone}</Text>
                  </Pressable>
                ) : null}
                {client.account_email && client.account_email !== client.parent_email ? (
                  <Text className="text-[11px] text-stone mt-1.5">RallyHUB login: {client.account_email}</Text>
                ) : null}
                {client.coach_notes ? <Text className="text-xs text-bark dark:text-cream mt-2 italic">{client.coach_notes}</Text> : null}
              </>
            )}
          </View>

          {/* Athletes */}
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">
            Athlete{client.athletes.length === 1 ? '' : 's'}
          </Text>
          {client.athletes.length === 0 ? (
            <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
              <Text className="text-sm text-stone dark:text-parchment">Athlete details appear after this family requests their first lesson.</Text>
            </View>
          ) : client.athletes.map((a) => <AthleteCard key={a.id} a={a} connectionId={client.connection_id} onSaved={load} />)}

          {/* Signed documents */}
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1 mt-2">Signed documents</Text>
          <View className="bg-warm-white dark:bg-bark-light rounded-xl px-4 py-2 border border-parchment dark:border-rally-900 mb-4">
            <SignedDocumentsList
              rows={signedDocs}
              label={(r) => `${r.athletes ? `${r.athletes.first_name}${r.athletes.last_name ? ' ' + r.athletes.last_name : ''}` : 'Athlete'}${r.signer_role === 'athlete' ? ' (athlete co-sign)' : ''}`}
              emptyText="No signed terms or release yet. Use Request signature on an athlete above."
            />
          </View>

          {/* Groups */}
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1 mt-2">Groups</Text>
          <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900">
            <Text className="text-xs text-stone dark:text-parchment mb-3">Tap to add or remove. Groups let you share open times with just these families.</Text>
            <View className="flex-row flex-wrap">
              {groups.map((g, i) => {
                const on = client.group_ids.includes(g.id);
                const color = GROUP_COLORS[i % GROUP_COLORS.length];
                return (
                  <Pressable
                    key={g.id}
                    disabled={busyGroup === g.id}
                    onPress={() => toggleGroup(g.id)}
                    className="flex-row items-center rounded-full px-3 py-1.5 mr-2 mb-2 border"
                    style={{ backgroundColor: on ? color : color + '10', borderColor: on ? color : color + '40' }}
                  >
                    <Ionicons name={on ? 'checkmark' : 'add'} size={14} color={on ? '#fff' : color} />
                    <Text className="text-xs font-semibold ml-1" style={{ color: on ? '#fff' : color }}>{g.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="flex-row items-center mt-1">
              <TextInput
                value={newGroup}
                onChangeText={setNewGroup}
                placeholder="New group (e.g. Setters, 14U Elite)"
                placeholderTextColor="#8FA8BF"
                onSubmitEditing={addToNewGroup}
                returnKeyType="done"
                className="flex-1 bg-cream dark:bg-bark rounded-lg px-3 py-2 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
              />
              <Pressable
                disabled={!newGroup.trim() || busyGroup === 'new'}
                onPress={addToNewGroup}
                className="ml-2 rounded-lg px-3 py-2 active:opacity-80"
                style={{ backgroundColor: newGroup.trim() ? '#0d9488' : '#0d948850' }}
              >
                <Text className="text-sm font-semibold text-white">{busyGroup === 'new' ? '…' : 'Add'}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
