import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCoachStore } from '@/stores/useCoachStore';
import {
  fetchClientRoster, fetchClientGroups, clientDisplayName, isSupabaseConfigured,
  GROUP_COLORS, avatarColor, initials, type RosterClient,
} from '@/lib/coach';
import type { ClientGroup } from '@/types/database';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import Avatar from '@/components/Avatar';

const fmtShort = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function CoachClientsScreen() {
  // Rendered as a coach tab (app/(coach)) → no back arrow.
  const inTab = useSegments()[0] === '(coach)';
  const ic = useIconColors();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const [clients, setClients] = useState<RosterClient[]>([]);
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!coachProfile || !isSupabaseConfigured) { setLoading(false); return; }
    const [r, g] = await Promise.all([fetchClientRoster(), fetchClientGroups(coachProfile.id)]);
    setClients(r.data);
    setGroups(g.data);
    setLoading(false);
  }, [coachProfile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const groupColor = (id: string) => GROUP_COLORS[Math.max(groups.findIndex((g) => g.id === id), 0) % GROUP_COLORS.length];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (groupFilter && !c.group_ids.includes(groupFilter)) return false;
      if (!q) return true;
      return [clientDisplayName(c), c.parent_name, c.parent_email, ...c.athletes.map((a) => a.club_team)]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [clients, query, groupFilter]);

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        {inTab ? <View className="w-6" /> : (
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="chevron-back" size={24} color={ic.muted} />
          </Pressable>
        )}
        <Text className="text-lg font-bold text-bark dark:text-cream">Clients</Text>
        <Pressable onPress={() => router.push('/coach/segments')} className="p-1" accessibilityLabel="Manage groups">
          <Ionicons name="people-circle-outline" size={24} color="#0d9488" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Search */}
        <View className="flex-row items-center bg-warm-white dark:bg-bark-light rounded-xl px-3 border border-parchment dark:border-rally-900 mb-3">
          <Ionicons name="search" size={16} color={ic.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search athletes, parents, clubs"
            placeholderTextColor="#8FA8BF"
            className="flex-1 py-2.5 ml-2 text-sm text-bark dark:text-cream"
            autoCorrect={false}
          />
        </View>

        {/* Group filter */}
        {groups.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ paddingRight: 8 }}>
            {[{ id: null as string | null, name: `All (${clients.length})` }, ...groups].map((g) => {
              const active = groupFilter === g.id;
              const color = g.id ? groupColor(g.id) : '#1E3A5F';
              return (
                <Pressable
                  key={g.id ?? 'all'}
                  onPress={() => { tapLight(); setGroupFilter(g.id); }}
                  className="rounded-full px-3 py-1.5 mr-2 border"
                  style={{ backgroundColor: active ? color : color + '12', borderColor: active ? color : color + '30' }}
                >
                  <Text className="text-xs font-semibold" style={{ color: active ? '#fff' : color }}>{g.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {loading ? (
          <ActivityIndicator color="#3B82B0" className="mt-6" />
        ) : clients.length === 0 ? (
          <View className="items-center py-10 px-6">
            <Ionicons name="people-outline" size={34} color={ic.placeholder} />
            <Text className="text-base font-semibold text-bark dark:text-cream mt-3">No clients yet</Text>
            <Text className="text-sm text-stone dark:text-parchment text-center mt-1">
              Families appear here once they enter your client code. Share it from your dashboard with “Invite a client by text.”
            </Text>
          </View>
        ) : shown.length === 0 ? (
          <Text className="text-sm text-stone dark:text-parchment text-center mt-6">No clients match.</Text>
        ) : (
          shown.map((c) => {
            const name = clientDisplayName(c);
            const color = avatarColor(c.connection_id);
            const a = c.athletes[0];
            const meta = [
              a?.grad_year ? `Class of ${a.grad_year}` : null,
              a?.positions?.length ? a.positions.join('/') : null,
              a?.club_team,
            ].filter(Boolean).join(' · ');
            return (
              <Pressable
                key={c.connection_id}
                onPress={() => router.push({ pathname: '/coach/client', params: { connectionId: c.connection_id } })}
                className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 border border-parchment dark:border-rally-900 mb-2 active:opacity-80"
                style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
              >
                <View className="flex-row items-center">
                  <View className="mr-3">
                    <Avatar uri={c.athletes.find((x) => x.photo_url)?.photo_url} name={name} size={44} colorKey={c.connection_id} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-bark dark:text-cream" numberOfLines={1}>{name}</Text>
                    {meta ? <Text className="text-xs text-stone dark:text-parchment mt-0.5" numberOfLines={1}>{meta}</Text> : null}
                    <Text className="text-xs text-stone dark:text-parchment mt-0.5" numberOfLines={1}>
                      {c.parent_name ? `Parent: ${c.parent_name}` : c.parent_email ?? ''}
                    </Text>
                  </View>
                  <View className="items-end ml-2">
                    {c.pending_requests > 0 ? (
                      <View className="bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-md mb-1">
                        <Text className="text-[10px] font-bold text-amber-700 dark:text-amber-300">{c.pending_requests} PENDING</Text>
                      </View>
                    ) : null}
                    <Text className="text-[11px] text-stone">
                      {c.next_lesson_at ? `Next ${fmtShort(c.next_lesson_at)}` : `${c.lessons_booked} lesson${c.lessons_booked === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                </View>
                {c.group_ids.length > 0 && (
                  <View className="flex-row flex-wrap mt-2 ml-14">
                    {c.group_ids.map((gid) => {
                      const g = groups.find((x) => x.id === gid);
                      if (!g) return null;
                      return (
                        <View key={gid} className="rounded-full px-2 py-0.5 mr-1.5 mb-1" style={{ backgroundColor: groupColor(gid) + '18' }}>
                          <Text className="text-[10px] font-semibold" style={{ color: groupColor(gid) }}>{g.name}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
