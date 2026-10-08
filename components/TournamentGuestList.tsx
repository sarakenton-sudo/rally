import { track } from '@/lib/track-event';
import { useState, useCallback } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { fetchFans } from '@/lib/fan';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { notifySuccess } from '@/lib/haptics';
import type { Tournament } from '@/types/database';

/**
 * Tournament page → Fans. Fans follow the whole family in the free
 * RallyHUB app, so there's nothing to set up per tournament: they see it
 * automatically and get pushes on game day, when the stream goes up, and
 * when new tournaments are added. The parent can also send a quick update.
 */
export default function TournamentGuestList({ tournament }: { tournament: Tournament }) {
  const [fans, setFans] = useState<{ fan_user_id: string | null }[]>([]);
  useFocusEffect(useCallback(() => { fetchFans().then(setFans); }, []));
  const following = fans.filter((f) => f.fan_user_id).length;
  const notYet = fans.length - following;
  const [update, setUpdate] = useState('');
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);

  const sendUpdate = async () => {
    const msg = update.trim();
    if (!msg) return;
    setSending(true);
    const { data, error } = await (supabase.rpc as any)('post_tournament_update', { p_tournament_id: tournament.id, p_message: msg });
    if (error) { setSending(false); showToast(error.message); return; }
    track('fan_update_sent', { fans: data?.fans ?? 0 });
    const res = await supabase.functions.invoke('notify-fans', { body: { update_id: data.update_id } });
    setSending(false);
    notifySuccess();
    setUpdate('');
    const n = (res.data as any)?.fans ?? data.fans ?? 0;
    setSentNote(n ? `Sent to ${n} fan${n === 1 ? '' : 's'}.` : 'Posted. Fans see it once they join the app.');
  };

  return (
    <View>
      <Pressable onPress={() => router.push('/fans')} className="flex-row items-center active:opacity-70" accessibilityLabel="Manage fans">
        <Ionicons name={following ? 'checkmark-circle' : 'people-outline'} size={16} color={following ? '#15803d' : '#ec4899'} />
        <Text className="text-sm font-semibold text-bark dark:text-cream ml-1.5 flex-1">
          {following ? `${following} fan${following === 1 ? '' : 's'} following on the app` : 'No fans on the app yet'}
        </Text>
        <Text className="text-xs font-semibold text-pink-700 dark:text-pink-300">{notYet > 0 ? `${notYet} invited ›` : fans.length ? 'Fans ›' : 'Invite fans ›'}</Text>
      </Pressable>
      <Text className="text-xs text-stone dark:text-parchment mt-1 mb-3 leading-4">
        They see this tournament automatically and get a push on game day, when the stream is up, and for anything you send below.
      </Text>

      <View className="bg-white/70 dark:bg-bark-light rounded-xl p-3 border border-pink-100 dark:border-pink-900/30">
        <TextInput
          value={update}
          onChangeText={(v) => { setUpdate(v); setSentNote(null); }}
          placeholder="Send an update, e.g. We're in the gold bracket! Court 4 at 8am."
          placeholderTextColor="#8FA8BF"
          multiline
          maxLength={280}
          className="text-sm text-bark dark:text-cream bg-cream dark:bg-bark rounded-lg px-3 py-2"
          style={{ minHeight: 52, textAlignVertical: 'top' }}
          accessibilityLabel="Update for guests"
        />
        <View className="flex-row items-center mt-2">
          <Text className="text-[11px] text-stone flex-1">{sentNote ?? 'Free push to every fan following.'}</Text>
          <Pressable onPress={sendUpdate} disabled={sending || !update.trim()} className="rounded-lg px-3 py-2 active:opacity-80" style={{ backgroundColor: update.trim() ? '#ec4899' : '#f9c6dd' }} accessibilityLabel="Send update">
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-xs font-bold text-white">Send update</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
