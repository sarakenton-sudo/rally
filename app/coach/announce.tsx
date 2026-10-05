import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useCoachStore } from '@/stores/useCoachStore';
import { showToast } from '@/components/Toast';
import {
  fetchUpcomingSlots, fetchClientGroups, fetchClientRoster, announceSlots, countAnnouncementsToday, clientDisplayName,
  isSupabaseConfigured, type SlotWithRefs, type RosterClient,
} from '@/lib/coach';
import { trackEvent } from '@/lib/track-event';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError, tapLight } from '@/lib/haptics';
import type { ClientGroup } from '@/types/database';

const DAILY_CAP = 3;
const fmtSlot = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

/**
 * Announce open times to families (Phase 2). Push + email with a booking link
 * and unsubscribe; 3 per day. ?slot=<id> preselects one block (from Schedule).
 */
export default function AnnounceScreen() {
  const ic = useIconColors();
  const { user } = useAuth();
  const coach = useCoachStore((s) => s.coachProfile);
  const { slot: preselect } = useLocalSearchParams<{ slot?: string }>();
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<SlotWithRefs[]>([]);
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [roster, setRoster] = useState<RosterClient[]>([]);
  const [sentToday, setSentToday] = useState(0);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [audience, setAudience] = useState<'all' | 'group' | 'families'>('all');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [families, setFamilies] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [edited, setEdited] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!coach || !isSupabaseConfigured) { setLoading(false); return; }
    const [s, g, r, n] = await Promise.all([fetchUpcomingSlots(coach.id), fetchClientGroups(coach.id), fetchClientRoster(), countAnnouncementsToday(coach.id)]);
    const in14 = Date.now() + 14 * 86_400_000;
    const open = s.data.filter((x) => x.status === 'open' && x.seats_taken < x.seats_total && x.visibility === 'all' && new Date(x.starts_at).getTime() < in14);
    setSlots(open);
    setPicked(new Set(preselect && open.some((o) => o.id === preselect) ? [preselect] : open.map((o) => o.id)));
    setGroups(g.data);
    setRoster(r.data);
    setSentToday(n);
    setLoading(false);
  }, [coach?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const pickedSlots = useMemo(() => slots.filter((s) => picked.has(s.id)), [slots, picked]);
  const link = (coach as any)?.booking_page_published && coach?.slug ? `rally-hub.com/book/${coach.slug}` : 'the RallyHUB app';
  const suggested = pickedSlots.length
    ? `${coach?.display_name ?? 'I'} has open lesson times: ${pickedSlots.slice(0, 6).map((s) => fmtSlot(s.starts_at)).join(', ')}${pickedSlots.length > 6 ? ', and more' : ''}. Book at ${link}.`
    : '';
  const text = edited ? message : suggested;
  const recipients = audience === 'all' ? roster.length : audience === 'families' ? families.size : null;

  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  const send = async () => {
    if (!pickedSlots.length) return showToast('Pick at least one open time');
    if (!text.trim()) return showToast('Write a message');
    if (audience === 'group' && !groupId) return showToast('Pick a group');
    if (audience === 'families' && !families.size) return showToast('Pick at least one family');
    setSending(true);
    const { data, error } = await announceSlots({
      slotIds: pickedSlots.map((s) => s.id), audience, groupId: groupId ?? undefined,
      connectionIds: [...families], message: text.trim(),
    });
    setSending(false);
    if (error || !data) { notifyError(); return showToast(error?.message ?? 'Could not send'); }
    notifySuccess();
    if (user) trackEvent(user.id, 'coach_announce_sent', { audience, slot_count: pickedSlots.length, recipients: data.recipients });
    router.back();
    showToast(`Sent to ${data.recipients} famil${data.recipients === 1 ? 'y' : 'ies'}`);
  };

  const Chip = ({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <Pressable onPress={() => { tapLight(); onPress(); }} className={`rounded-full px-3 py-1.5 mr-2 mb-2 border ${on ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-rally-900 bg-warm-white dark:bg-bark-light'}`}>
      <Text className={`text-xs font-semibold ${on ? 'text-cream' : 'text-bark dark:text-parchment'}`}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
          <Pressable onPress={() => router.back()} className="p-1" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">Announce open times</Text>
          <Pressable onPress={send} disabled={sending || sentToday >= DAILY_CAP} className={`px-4 py-1.5 rounded-lg ${sending || sentToday >= DAILY_CAP ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}>
            <Text className="text-sm font-semibold text-cream">{sending ? 'Sending…' : 'Send'}</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#3B82B0" className="mt-8" />
        ) : slots.length === 0 ? (
          <View className="items-center px-8 mt-16">
            <Ionicons name="calendar-outline" size={40} color={ic.placeholder} />
            <Text className="text-base font-bold text-bark dark:text-cream mt-3">No open times to announce</Text>
            <Text className="text-sm text-stone dark:text-parchment text-center mt-1">Add open time for "Everyone" in the next two weeks, then announce it here.</Text>
            <Pressable onPress={() => router.replace('/coach/availability-add')} className="bg-rally-600 rounded-xl px-5 py-2.5 mt-4"><Text className="text-sm font-semibold text-cream">Add open time</Text></Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            {sentToday >= DAILY_CAP && (
              <View className="rounded-xl p-3 mb-3" style={{ backgroundColor: '#d977061a' }}>
                <Text className="text-xs font-semibold" style={{ color: '#b45309' }}>You've sent {DAILY_CAP} announcements today — try again tomorrow.</Text>
              </View>
            )}

            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Open times · next 2 weeks</Text>
            <View className="flex-row flex-wrap mb-4">
              {slots.map((s) => (
                <Chip key={s.id} on={picked.has(s.id)} label={`${fmtSlot(s.starts_at)}${s.seats_total > 1 ? ` (${s.seats_total - s.seats_taken} spots)` : ''}`} onPress={() => setPicked((p) => toggle(p, s.id))} />
              ))}
            </View>

            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Send to</Text>
            <View className="flex-row flex-wrap mb-2">
              <Chip on={audience === 'all'} label={`All clients (${roster.length})`} onPress={() => setAudience('all')} />
              {groups.length > 0 && <Chip on={audience === 'group'} label="A group" onPress={() => setAudience('group')} />}
              <Chip on={audience === 'families'} label="Choose families" onPress={() => setAudience('families')} />
            </View>
            {audience === 'group' && (
              <View className="flex-row flex-wrap mb-2 pl-2">
                {groups.map((g) => <Chip key={g.id} on={groupId === g.id} label={g.name} onPress={() => setGroupId(g.id)} />)}
              </View>
            )}
            {audience === 'families' && (
              <View className="flex-row flex-wrap mb-2 pl-2">
                {roster.map((c) => <Chip key={c.connection_id} on={families.has(c.connection_id)} label={clientDisplayName(c)} onPress={() => setFamilies((f) => toggle(f, c.connection_id))} />)}
              </View>
            )}

            <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1 mt-2">Message</Text>
            <TextInput
              value={text}
              onChangeText={(v) => { setEdited(true); setMessage(v); }}
              multiline
              maxLength={600}
              className="bg-warm-white dark:bg-bark-light rounded-xl p-3 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
              style={{ minHeight: 110, textAlignVertical: 'top' }}
            />
            {edited && (
              <Pressable onPress={() => { setEdited(false); setMessage(''); }} className="mt-1 self-start"><Text className="text-xs text-rally-600 font-semibold">Use suggested message</Text></Pressable>
            )}

            <View className="flex-row items-start mt-4 px-1">
              <Ionicons name="information-circle-outline" size={14} color={ic.muted} style={{ marginTop: 1 }} />
              <Text className="text-[11px] text-stone dark:text-parchment ml-1 flex-1 leading-4">
                Goes out as an app notification and email{recipients !== null ? ` to ${recipients} famil${recipients === 1 ? 'y' : 'ies'}` : ''}, with a link to book and a way to unsubscribe. Text messages are coming soon. {DAILY_CAP - Math.min(sentToday, DAILY_CAP)} of {DAILY_CAP} announcements left today.
              </Text>
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
