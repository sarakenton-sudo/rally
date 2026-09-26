import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useCoachStore } from '@/stores/useCoachStore';
import {
  fetchClientGroups, createClientGroup, deleteClientGroup,
  fetchCoachClients, fetchGroupMemberIds, addGroupMember, removeGroupMember,
  isSupabaseConfigured,
} from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';
import type { ClientGroup, CoachClient } from '@/types/database';

export default function SegmentsScreen() {
  const ic = useIconColors();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  const showAlert = (t: string, m: string) => {
    if (Platform.OS === 'web') window.alert(`${t}: ${m}`);
    else Alert.alert(t, m);
  };

  const load = useCallback(async () => {
    if (!coachProfile || !isSupabaseConfigured) { setLoading(false); return; }
    const [g, c] = await Promise.all([fetchClientGroups(coachProfile.id), fetchCoachClients()]);
    setGroups(g.data);
    setClients(c.data);
    setLoading(false);
  }, [coachProfile]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      if (!selectedGroupId) { setMemberIds([]); return; }
      const { data } = await fetchGroupMemberIds(selectedGroupId);
      setMemberIds(data);
    })();
  }, [selectedGroupId]);

  const handleCreate = async () => {
    if (!coachProfile || !newName.trim()) { notifyError(); return; }
    const { data, error } = await createClientGroup(coachProfile.id, newName.trim());
    if (error) { showAlert('Could not create', error.message); return; }
    if (data) {
      setGroups((g) => [...g, data]);
      setSelectedGroupId(data.id);
      setNewName('');
      notifySuccess();
    }
  };

  const handleDeleteGroup = (group: ClientGroup) => {
    const doDelete = async () => {
      await deleteClientGroup(group.id);
      setGroups((g) => g.filter((x) => x.id !== group.id));
      if (selectedGroupId === group.id) setSelectedGroupId(null);
      notifySuccess();
    };
    if (Platform.OS === 'web') { if (window.confirm(`Delete group "${group.name}"?`)) doDelete(); }
    else Alert.alert('Delete group', `Delete "${group.name}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: doDelete }]);
  };

  const toggleMember = async (client: CoachClient) => {
    if (!selectedGroupId) return;
    const isMember = memberIds.includes(client.connection_id);
    setMemberIds((m) => (isMember ? m.filter((x) => x !== client.connection_id) : [...m, client.connection_id]));
    const fn = isMember ? removeGroupMember : addGroupMember;
    const { error } = await fn(selectedGroupId, client.connection_id);
    if (error) { showAlert('Update failed', error.message); load(); }
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Client Groups</Text>
        <View className="w-6" />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text className="text-sm text-stone dark:text-parchment mb-4">
            Group clients into segments (e.g. "Setters", "14U travel") so you can open availability to just that group.
          </Text>

          {/* Create */}
          <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
            <FormField label="New group" value={newName} onChangeText={setNewName} placeholder="e.g. Setters" />
            <Pressable onPress={handleCreate} className="bg-rally-600 rounded-xl py-2.5 items-center active:opacity-80 -mt-1">
              <Text className="text-sm font-semibold text-cream">Create group</Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color="#3B82B0" className="mt-4" />
          ) : (
            <>
              {/* Group chips */}
              {groups.length > 0 && (
                <View className="flex-row flex-wrap gap-2 mb-4">
                  {groups.map((g) => {
                    const on = selectedGroupId === g.id;
                    return (
                      <Pressable
                        key={g.id}
                        onPress={() => setSelectedGroupId(on ? null : g.id)}
                        className={`px-3 py-2 rounded-full border ${on ? 'bg-rally-600 border-rally-600' : 'bg-warm-white dark:bg-bark-light border-parchment dark:border-rally-900'}`}
                      >
                        <Text className={`text-xs font-semibold ${on ? 'text-cream' : 'text-stone dark:text-parchment'}`}>{g.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Selected group members */}
              {selectedGroup && (
                <View>
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-sm font-bold text-bark dark:text-cream">Members of "{selectedGroup.name}"</Text>
                    <Pressable onPress={() => handleDeleteGroup(selectedGroup)} className="flex-row items-center active:opacity-60">
                      <Ionicons name="trash-outline" size={15} color="#dc2626" />
                      <Text className="text-xs font-semibold text-red-600 ml-1">Delete</Text>
                    </Pressable>
                  </View>

                  {clients.length === 0 ? (
                    <View className="items-center py-6">
                      <Ionicons name="people-outline" size={26} color={ic.placeholder} />
                      <Text className="text-xs text-stone dark:text-parchment mt-2 text-center px-6">
                        No clients yet. Families appear here once they book with you or accept an invite — then you can add them to groups.
                      </Text>
                    </View>
                  ) : (
                    clients.map((c) => {
                      const isMember = memberIds.includes(c.connection_id);
                      return (
                        <Pressable
                          key={c.connection_id}
                          onPress={() => toggleMember(c)}
                          className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 border border-parchment dark:border-rally-900 mb-2 flex-row items-center active:opacity-80"
                        >
                          <Text className="flex-1 text-sm text-bark dark:text-cream">{c.athlete_name}</Text>
                          <Ionicons name={isMember ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isMember ? '#3B82B0' : '#8FA8BF'} />
                        </Pressable>
                      );
                    })
                  )}
                </View>
              )}

              {groups.length === 0 && (
                <View className="items-center py-6">
                  <Ionicons name="people-circle-outline" size={30} color={ic.placeholder} />
                  <Text className="text-sm text-stone dark:text-parchment mt-2">No groups yet — create one above</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
