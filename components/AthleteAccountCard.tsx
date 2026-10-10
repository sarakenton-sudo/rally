import * as Clipboard from 'expo-clipboard';
import { familyInviteMessage } from '@/lib/inviteText';
import { useDataRefresh } from '@/providers/DataProvider';
import { track } from '@/lib/track-event';
import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { showToast } from '@/components/Toast';
import { notifySuccess } from '@/lib/haptics';

interface PendingInvite { id: string; email: string; invite_code: string; created_at: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Athlete page: does this athlete have their own RallyHUB login? Invite them,
 * resend the invite, or fix the email it went to. Athlete invites give
 * view-only access (same as Settings → Invite).
 */
export default function AthleteAccountCard({ athleteId, firstName, hasLogin }: { athleteId: string; firstName: string; hasLogin: boolean }) {
  const { refresh } = useDataRefresh();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { user } = useAuth();
  const [invite, setInvite] = useState<PendingInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await (supabase.from('athlete_invites') as any)
      .select('id, email, invite_code, created_at')
      .eq('athlete_id', athleteId).eq('invite_type', 'athlete').eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(1);
    setInvite((data as PendingInvite[] | null)?.[0] ?? null);
    setLoading(false);
  }, [athleteId]);
  useEffect(() => { if (!hasLogin) load(); else setLoading(false); }, [load, hasLogin]);

  const sendEmail = (to: string, code: string) =>
    supabase.functions.invoke('send-referral', {
      body: { referrer_user_id: user!.id, referred_email: to, invite_code: code, invite_type: 'athlete' },
    });

  const submit = async () => {
    const to = email.trim().toLowerCase();
    if (!EMAIL_RE.test(to)) { setError('Enter a valid email address.'); return; }
    if (!user) return;
    setBusy(true); setError(null);
    let code = invite?.invite_code;
    if (invite) {
      // Fix the address on the existing invite and give it a fresh 30 days.
      const { error: e } = await (supabase.from('athlete_invites') as any)
        .update({ email: to, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() })
        .eq('id', invite.id);
      if (e) { setBusy(false); setError(e.message); return; }
    } else {
      const { data, error: e } = await (supabase.from('athlete_invites') as any)
        .insert({ inviter_id: user.id, athlete_id: athleteId, email: to, invite_type: 'athlete', permission: 'view' })
        .select('invite_code').single();
      if (e) { setBusy(false); setError(e.message); return; }
      code = (data as { invite_code: string }).invite_code;
    }
    await sendEmail(to, code!).catch(() => {});
    setBusy(false); setEditing(false);
    notifySuccess();
    showToast(`Invite sent to ${to}`);
    load();
  };

  const resend = async () => {
    if (!invite || !user) return;
    setBusy(true);
    await sendEmail(invite.email, invite.invite_code).catch(() => {});
    setBusy(false);
    showToast(`Invite re-sent to ${invite.email}`);
  };

  if (loading) return <ActivityIndicator color="#3B82B0" className="my-3" />;

  // Text it instead of (or as well as) email: same invite, app link first.
  const copyText = async () => {
    if (!invite) return;
    const text = familyInviteMessage('athlete', firstName, invite.invite_code);
    try {
      if (Platform.OS === 'web') await navigator.clipboard.writeText(text);
      else await Clipboard.setStringAsync(text);
      showToast(`Invite copied. Text it to ${firstName}.`);
    } catch {
      if (Platform.OS === 'web') window.prompt('Copy this:', text);
    }
  };
  const removeLogin = async () => {
    setBusy(true);
    const { data, error: e } = await (supabase.rpc as any)('remove_athlete_login', { p_athlete_id: athleteId });
    setBusy(false);
    setConfirmRemove(false);
    if (e) { setError(e.message); return; }
    track('athlete_login_removed', { account_deleted: !!data?.account_deleted });
    showToast(`${firstName}'s login was removed`);
    setInvite(null);
    refresh();
  };

  const status = hasLogin
    ? { icon: 'checkmark-circle' as const, color: '#16a34a', title: `${firstName} has a RallyHUB login`, sub: 'They see their own schedule, team code and streaming links.' }
    : invite
      ? { icon: 'hourglass-outline' as const, color: '#d97706', title: `Invite sent to ${invite.email}`, sub: `Waiting for ${firstName} to sign up with the code ${invite.invite_code}.` }
      : { icon: 'person-add-outline' as const, color: '#3B82B0', title: `Invite ${firstName} to RallyHUB`, sub: 'They get their own login to see schedules, team codes and streams. View only.' };

  return (
    <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900">
      <View className="flex-row items-start">
        <Ionicons name={status.icon} size={20} color={status.color} />
        <View className="flex-1 ml-2.5">
          <Text className="text-sm font-semibold text-bark dark:text-cream">{status.title}</Text>
          <Text className="text-xs text-stone dark:text-parchment mt-0.5">{status.sub}</Text>
        </View>
      </View>

      {!hasLogin && (editing || !invite) && (
        <View className="mt-3">
          <TextInput
            value={email}
            onChangeText={(v) => { setEmail(v); setError(null); }}
            placeholder={`${firstName}'s email`}
            placeholderTextColor="#8FA8BF"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            className="bg-cream dark:bg-bark rounded-lg px-3 py-2.5 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
            accessibilityLabel={`${firstName}'s email`}
          />
          {error ? <Text className="text-xs text-red-600 mt-1">{error}</Text> : null}
          <View className="flex-row mt-2" style={{ gap: 8 }}>
            <Pressable onPress={submit} disabled={busy} className="rounded-lg px-4 py-2 bg-rally-600 active:opacity-80">
              <Text className="text-xs font-bold text-white">{busy ? 'Sending…' : invite ? 'Save & resend' : 'Send invite'}</Text>
            </Pressable>
            {invite && (
              <Pressable onPress={() => { setEditing(false); setError(null); }} className="rounded-lg px-4 py-2">
                <Text className="text-xs font-semibold text-stone">Cancel</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Remove the athlete's own login (their profile and schedule stay) */}
      {hasLogin && (
        confirmRemove ? (
          <View className="rounded-lg p-3 mt-3" style={{ backgroundColor: '#fee2e2' }}>
            <Text className="text-xs text-red-800">
              {firstName} won't be able to sign in anymore. Their profile, schedule and everything you've added stay. You can invite them again later.
            </Text>
            <View className="flex-row mt-2" style={{ gap: 8 }}>
              <Pressable onPress={removeLogin} disabled={busy} className="rounded-lg px-3 py-2 active:opacity-80" style={{ backgroundColor: '#DC2626' }} accessibilityLabel="Confirm remove login">
                <Text className="text-xs font-bold text-white">{busy ? 'Removing…' : 'Remove login'}</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmRemove(false)} className="rounded-lg px-3 py-2 bg-white active:opacity-70">
                <Text className="text-xs font-semibold text-bark">Keep it</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setConfirmRemove(true)} className="self-start mt-3 py-1 active:opacity-70" accessibilityLabel={`Remove ${firstName}'s login`}>
            <Text className="text-xs font-semibold text-red-600">Remove login</Text>
          </Pressable>
        )
      )}
      {error && hasLogin ? <Text className="text-xs text-red-600 mt-1">{error}</Text> : null}

      {!hasLogin && invite && !editing && (
        <View className="flex-row mt-3" style={{ gap: 8 }}>
          <Pressable onPress={copyText} className="rounded-lg px-3 py-2 active:opacity-80" style={{ backgroundColor: '#FF7A59' }} accessibilityLabel="Copy invite text">
            <Text className="text-xs font-bold text-white">Copy invite text</Text>
          </Pressable>
          <Pressable onPress={resend} disabled={busy} className="rounded-lg px-3 py-2 bg-rally-50 dark:bg-rally-900/30 active:opacity-70">
            <Text className="text-xs font-semibold text-rally-600">{busy ? 'Sending…' : 'Email again'}</Text>
          </Pressable>
          <Pressable onPress={() => { setEmail(invite.email); setEditing(true); }} className="rounded-lg px-3 py-2 active:opacity-70">
            <Text className="text-xs font-semibold text-stone">Change email</Text>
          </Pressable>
          <Pressable onPress={removeLogin} disabled={busy} className="rounded-lg px-3 py-2 active:opacity-70" accessibilityLabel="Cancel invite">
            <Text className="text-xs font-semibold text-red-600">Cancel invite</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
