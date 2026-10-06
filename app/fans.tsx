import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { Stack, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/components/Toast';
import SwipeToDelete from '@/components/SwipeToDelete';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useIconColors } from '@/lib/colors';
import { tapLight, notifySuccess } from '@/lib/haptics';
import { createFanInvite, fetchFans, removeFan, fanInviteMessage, type Fan } from '@/lib/fan';

const FAN = '#DB2777';

/** Copy text; on the web a blocked clipboard falls back to showing it to copy by hand. */
async function copy(text: string, done: string) {
  try {
    if (Platform.OS === 'web') await navigator.clipboard.writeText(text);
    else await Clipboard.setStringAsync(text);
    showToast(done);
  } catch {
    if (Platform.OS === 'web') window.prompt('Copy this invite and send it in a text:', text);
    else showToast("Couldn't copy. Try again.");
  }
}

/**
 * Fans: friends and family who follow your athletes' tournaments and games in
 * the free app (no lessons, travel or logins). Invite = a text with their own
 * one-time code, copied for you to send from your own Messages.
 */
export default function FansScreen() {
  const ic = useIconColors();
  const athletes = useSeasonStore((s) => s.athletes);
  const names = athletes.map((a) => a.first_name).join(' & ') || 'our athlete';
  const [fans, setFans] = useState<Fan[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => setFans(await fetchFans()), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const invite = async () => {
    const who = name.trim();
    if (!who) { showToast('Add their name first'); return; }
    tapLight();
    setBusy(true);
    const { fan, error } = await createFanInvite(who);
    setBusy(false);
    if (error || !fan) { showToast(error ?? "Couldn't create the invite"); return; }
    notifySuccess();
    setName('');
    await copy(fanInviteMessage(who, names, fan.code), `Invite for ${who} copied. Paste it into a text.`);
    load();
  };

  const remove = async (f: Fan) => {
    const { error } = await removeFan(f.id);
    if (error) { showToast(error); return; }
    setFans((list) => (list ?? []).filter((x) => x.id !== f.id));
    showToast(`${f.name} removed`);
  };

  const following = (fans ?? []).filter((f) => f.fan_user_id).length;

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/family'))} className="p-1" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Fans</Text>
        <View className="w-6" />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor="#3B82B0" />}
      >
        <Text className="text-sm text-stone dark:text-parchment leading-5">
          Fans follow {names}'s tournaments and games in the free RallyHUB app, with alerts on game day. They don't see lessons, travel or logins.
        </Text>

        {/* Invite */}
        <View className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 mt-4 border border-parchment dark:border-rally-900">
          <Text className="text-sm font-bold text-bark dark:text-cream">Invite a fan</Text>
          <Text className="text-xs text-stone dark:text-parchment mt-0.5 mb-3">We'll copy a text with their own code. Paste it into Messages.</Text>
          <TextInput
            nativeID="fan-name"
            value={name}
            onChangeText={setName}
            placeholder="Their name, e.g. Grandma Sue"
            placeholderTextColor="#8FA8BF"
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={invite}
            maxLength={60}
            className="text-sm text-bark dark:text-cream bg-cream dark:bg-bark rounded-xl px-3 py-3 border border-parchment dark:border-rally-900"
            accessibilityLabel="Fan's name"
          />
          <Pressable onPress={invite} disabled={busy} className="flex-row items-center justify-center rounded-xl py-3 mt-3 active:opacity-80" style={{ backgroundColor: FAN }} accessibilityLabel="Copy invite text">
            {busy ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="copy-outline" size={16} color="#fff" />
                <Text className="text-sm font-bold text-white ml-1.5">Copy invite text</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* List */}
        <Text className="text-xs font-bold uppercase tracking-wider text-stone mt-6 mb-2 ml-1">
          {fans === null ? 'Your fans' : `Your fans · ${following} following`}
        </Text>
        {fans === null ? <ActivityIndicator color="#3B82B0" className="mt-4" /> : fans.length === 0 ? (
          <Text className="text-sm text-stone dark:text-parchment ml-1">No fans yet. Grandparents love this.</Text>
        ) : fans.map((f) => (
          <SwipeToDelete key={f.id} label="Remove" accessibilityLabel={`Remove ${f.name}`} onDelete={() => remove(f)}>
            <View className="bg-warm-white dark:bg-bark-light rounded-2xl px-4 py-3 mb-3 border border-parchment dark:border-rally-900 flex-row items-center">
              <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#FCE7F3' }}>
                <Text className="text-sm font-bold" style={{ color: FAN }}>{f.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-bark dark:text-cream">{f.name}</Text>
                <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                  {f.fan_user_id ? 'Following' : `Invited · code ${f.invite_code}`}
                </Text>
              </View>
              {f.fan_user_id ? (
                <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ backgroundColor: '#dcfce7' }}>
                  <Ionicons name="checkmark-circle" size={13} color="#15803d" />
                  <Text className="text-[11px] font-bold ml-1" style={{ color: '#15803d' }}>On the app</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => copy(fanInviteMessage(f.name, names, f.invite_code), `Invite for ${f.name} copied`)}
                  className="rounded-full px-3 py-1.5 active:opacity-70"
                  style={{ backgroundColor: '#FCE7F3' }}
                  accessibilityLabel={`Copy invite for ${f.name}`}
                >
                  <Text className="text-[11px] font-bold" style={{ color: FAN }}>Copy invite</Text>
                </Pressable>
              )}
            </View>
          </SwipeToDelete>
        ))}
        {fans && fans.length > 0 ? (
          <Text className="text-[11px] text-stone dark:text-parchment text-center mt-1">Swipe left on a fan to remove them.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
