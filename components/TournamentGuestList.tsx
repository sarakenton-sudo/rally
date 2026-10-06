import { useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useGuestStore } from '@/stores/useGuestStore';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { notifySuccess } from '@/lib/haptics';
import type { Tournament } from '@/types/database';
import type { GuestWithFan } from '@/components/GuestCard';

/**
 * Tournament page → Guests. Guests follow the whole family in the free
 * RallyHUB app, so there's nothing to set up per tournament: they see it
 * automatically and get pushes on game day, when the stream goes up, and
 * when new tournaments are added. The parent can also send a quick update.
 */
export default function TournamentGuestList({ tournament }: { tournament: Tournament }) {
  const guests = useGuestStore((s) => s.guests) as GuestWithFan[];
  const following = guests.filter((g) => g.invite_status === 'joined').length;
  const notYet = guests.length - following;
  const [update, setUpdate] = useState('');
  const [sending, setSending] = useState(false);
  const [sentNote, setSentNote] = useState<string | null>(null);

  const sendUpdate = async () => {
    const msg = update.trim();
    if (!msg) return;
    setSending(true);
    const { data, error } = await (supabase.rpc as any)('post_tournament_update', { p_tournament_id: tournament.id, p_message: msg });
    if (error) { setSending(false); showToast(error.message); return; }
    const res = await supabase.functions.invoke('notify-fans', { body: { update_id: data.update_id } });
    setSending(false);
    notifySuccess();
    setUpdate('');
    const fans = (res.data as any)?.fans ?? data.fans ?? 0;
    setSentNote(fans ? `Sent to ${fans} guest${fans === 1 ? '' : 's'}.` : 'Posted. Guests see it once they join the app.');
  };

  return (
    <View>
      <Pressable onPress={() => router.push('/guests')} className="flex-row items-center active:opacity-70" accessibilityLabel="Manage guests">
        <Ionicons name={following ? 'checkmark-circle' : 'people-outline'} size={16} color={following ? '#15803d' : '#ec4899'} />
        <Text className="text-sm font-semibold text-bark dark:text-cream ml-1.5 flex-1">
          {following ? `${following} guest${following === 1 ? '' : 's'} following on the app` : 'No guests on the app yet'}
        </Text>
        <Text className="text-xs font-semibold text-pink-700 dark:text-pink-300">{notYet > 0 ? `Invite ${notYet} more ›` : guests.length ? 'Guests ›' : 'Invite guests ›'}</Text>
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
          <Text className="text-[11px] text-stone flex-1">{sentNote ?? 'Free push to everyone following.'}</Text>
          <Pressable onPress={sendUpdate} disabled={sending || !update.trim()} className="rounded-lg px-3 py-2 active:opacity-80" style={{ backgroundColor: update.trim() ? '#ec4899' : '#f9c6dd' }} accessibilityLabel="Send update">
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-xs font-bold text-white">Send update</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
