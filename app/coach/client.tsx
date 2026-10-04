import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Linking, Alert, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCoachStore } from '@/stores/useCoachStore';
import {
  fetchClientRoster, fetchClientGroups, createClientGroup, addGroupMember, removeGroupMember,
  clientDisplayName, avatarColor, initials, GROUP_COLORS, isSupabaseConfigured, type RosterClient,
  fetchAcceptances, latestAcceptances, type PolicyAcceptance,
} from '@/lib/coach';
import type { ClientGroup } from '@/types/database';
import { useIconColors } from '@/lib/colors';
import SignedDocumentsList from '@/components/SignedDocumentsList';
import { tapLight, notifySuccess, notifyError } from '@/lib/haptics';
import Avatar from '@/components/Avatar';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtHeight = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;

export default function CoachClientScreen() {
  const ic = useIconColors();
  const { connectionId } = useLocalSearchParams<{ connectionId: string }>();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const [client, setClient] = useState<RosterClient | null>(null);
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState('');
  const [signedDocs, setSignedDocs] = useState<PolicyAcceptance[]>([]);

  const showAlert = (t: string, m: string) => {
    if (Platform.OS === 'web') window.alert(`${t}: ${m}`);
    else Alert.alert(t, m);
  };

  const load = useCallback(async () => {
    if (!coachProfile || !isSupabaseConfigured) { setLoading(false); return; }
    const [r, g] = await Promise.all([fetchClientRoster(), fetchClientGroups(coachProfile.id)]);
    const found = r.data.find((c) => c.connection_id === connectionId) ?? null;
    setClient(found);
    if (found && coachProfile) {
      const docs = await fetchAcceptances({ coachId: coachProfile.id, athleteIds: found.athletes.map((a) => a.id) });
      setSignedDocs(latestAcceptances(docs.data));
    }
    setGroups(g.data);
    setLoading(false);
  }, [coachProfile, connectionId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setMembership = (groupId: string, member: boolean) =>
    setClient((c) => c && ({
      ...c,
      group_ids: member ? [...c.group_ids, groupId] : c.group_ids.filter((id) => id !== groupId),
    }));

  const toggleGroup = async (groupId: string) => {
    if (!client) return;
    const member = client.group_ids.includes(groupId);
    tapLight();
    setBusyGroup(groupId);
    setMembership(groupId, !member); // optimistic
    const { error } = member
      ? await removeGroupMember(groupId, client.connection_id)
      : await addGroupMember(groupId, client.connection_id);
    if (error) {
      setMembership(groupId, member);
      showAlert("Couldn't update group", error.message);
      notifyError();
    }
    setBusyGroup(null);
  };

  const addToNewGroup = async () => {
    const name = newGroup.trim();
    if (!name || !coachProfile || !client) return;
    setBusyGroup('new');
    const { data, error } = await createClientGroup(coachProfile.id, name);
    if (error || !data) {
      showAlert("Couldn't create group", error?.message ?? 'Try again.');
      notifyError();
    } else {
      setGroups((g) => [...g, data]);
      const { error: addErr } = await addGroupMember(data.id, client.connection_id);
      if (!addErr) setMembership(data.id, true);
      setNewGroup('');
      notifySuccess();
    }
    setBusyGroup(null);
  };

  const name = client ? clientDisplayName(client) : '';

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
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
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View className="items-center mb-4">
            <View className="mb-2">
              <Avatar uri={client.athletes.find((x) => x.photo_url)?.photo_url} name={name} size={64} colorKey={client.connection_id} />
            </View>
            <Text className="text-xl font-bold text-bark dark:text-cream text-center">{name}</Text>
            <Text className="text-xs text-stone dark:text-parchment mt-0.5">Client since {fmtDate(client.connected_at)}</Text>
          </View>

          {/* Stats */}
          <View className="flex-row mb-4">
            {[
              { label: 'Lessons', value: String(client.lessons_booked), color: '#3B82B0' },
              { label: 'Pending', value: String(client.pending_requests), color: '#d97706' },
              { label: 'Next', value: client.next_lesson_at ? new Date(client.next_lesson_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—', color: '#1E3A5F' },
            ].map((s) => (
              <View key={s.label} className="flex-1 rounded-xl py-3 mx-1 items-center" style={{ backgroundColor: s.color + '12' }}>
                <Text className="text-lg font-bold" style={{ color: s.color }}>{s.value}</Text>
                <Text className="text-[11px] font-semibold text-stone dark:text-parchment">{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Parent */}
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Parent</Text>
          <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
            <Text className="text-sm font-semibold text-bark dark:text-cream">{client.parent_name || 'Name not set'}</Text>
            {client.parent_email ? (
              <Pressable onPress={() => Linking.openURL(`mailto:${client.parent_email}`)} className="flex-row items-center mt-1.5">
                <Ionicons name="mail-outline" size={14} color="#3B82B0" />
                <Text className="text-sm text-rally-600 ml-1.5">{client.parent_email}</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Athletes */}
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">
            Athlete{client.athletes.length === 1 ? '' : 's'}
          </Text>
          {client.athletes.length === 0 ? (
            <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
              <Text className="text-sm text-stone dark:text-parchment">
                Athlete details appear after this family requests their first lesson.
              </Text>
            </View>
          ) : client.athletes.map((a) => {
            const facts = [
              a.grad_year ? `Class of ${a.grad_year}` : null,
              a.positions?.length ? a.positions.join(' / ') : null,
              a.height_inches ? fmtHeight(a.height_inches) : null,
              a.level,
              a.club_team,
            ].filter(Boolean) as string[];
            return (
              <View key={a.id} className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2">
                <Text className="text-base font-bold text-bark dark:text-cream">{a.first_name}{a.last_name ? ` ${a.last_name}` : ''}</Text>
                {facts.length > 0 && (
                  <View className="flex-row flex-wrap mt-2">
                    {facts.map((f) => (
                      <View key={f} className="bg-rally-50 dark:bg-rally-900/30 rounded-md px-2 py-1 mr-1.5 mb-1.5">
                        <Text className="text-xs font-medium text-rally-700 dark:text-rally-200">{f}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {a.goals ? <Text className="text-sm text-bark dark:text-cream mt-1">Goals: {a.goals}</Text> : null}
              </View>
            );
          })}

          {/* Signed documents */}
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1 mt-2">Signed documents</Text>
          <View className="bg-warm-white dark:bg-bark-light rounded-xl px-4 py-2 border border-parchment dark:border-rally-900 mb-4">
            <SignedDocumentsList
              rows={signedDocs}
              label={(r) => r.athletes ? `${r.athletes.first_name}${r.athletes.last_name ? ' ' + r.athletes.last_name : ''}` : 'Athlete'}
              emptyText="This family hasn't signed your terms and release yet. They'll sign before their first lesson."
            />
          </View>

          {/* Groups */}
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1 mt-2">Groups</Text>
          <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900">
            <Text className="text-xs text-stone dark:text-parchment mb-3">
              Tap to add or remove. Groups let you share open times with just these families.
            </Text>
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
      )}
    </SafeAreaView>
  );
}
