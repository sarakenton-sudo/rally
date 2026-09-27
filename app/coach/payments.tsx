import { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, Platform, Share, AppState } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useCoachStore } from '@/stores/useCoachStore';
import { fetchMyCoach, fmtMoney, isSupabaseConfigured } from '@/lib/coach';
import {
  getConnectStatus, startConnectOnboarding, openStripeDashboard, getPayouts, savePaymentSettings, getPlatformFeeBps,
  fetchEarnings, earningsTotals, earningsCsv,
  type ConnectStatus, type PayoutsInfo, type PaymentTiming, type FeeHandling, type EarningsRow,
} from '@/lib/payments';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError, tapLight } from '@/lib/haptics';

type Range = 'week' | 'month' | 'year';

function rangeBounds(r: Range): [Date, Date] {
  const now = new Date();
  if (r === 'week') {
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return [mon, new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7)];
  }
  if (r === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1)];
}

// Same math as the server (_shared/stripe.ts computeCharge) — for the preview only.
function preview(priceCents: number, fee: FeeHandling, bps: number) {
  const platform = Math.round((priceCents * bps) / 10000);
  if (fee === 'surcharge') {
    const total = Math.ceil((priceCents + 30) / (1 - 0.029));
    return { parentPays: total, youGet: priceCents - platform };
  }
  return { parentPays: priceCents, youGet: priceCents - platform - (Math.round(priceCents * 0.029) + 30) };
}

export default function CoachPaymentsScreen() {
  const ic = useIconColors();
  const { user } = useAuth();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const setCoachProfile = useCoachStore((s) => s.setCoachProfile);

  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [payouts, setPayouts] = useState<PayoutsInfo | null>(null);
  const [bps, setBps] = useState(1000);
  const [timing, setTiming] = useState<PaymentTiming>('on_accept');
  const [hours, setHours] = useState('24');
  const [fee, setFee] = useState<FeeHandling>('absorb');
  const [dirty, setDirty] = useState(false);
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<EarningsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const alertMsg = (t: string, m: string) => (Platform.OS === 'web' ? window.alert(`${t}: ${m}`) : Alert.alert(t, m));

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !user) { setLoading(false); return; }
    const { data: coach } = await fetchMyCoach(user.id);
    if (coach) {
      setCoachProfile(coach);
      const c = coach as any;
      if (!dirty) {
        setTiming(c.payment_timing ?? 'on_accept');
        setHours(String(c.payment_hours_before ?? 24));
        setFee(c.fee_handling === 'surcharge' ? 'surcharge' : 'absorb');
      }
      const [st, b] = await Promise.all([
        c.stripe_account_id ? getConnectStatus() : Promise.resolve({ data: null, error: null }),
        getPlatformFeeBps(),
      ]);
      setStatus(st.data);
      setBps(b);
      if (st.data?.charges_enabled) getPayouts().then(({ data }) => setPayouts(data));
      const [from, to] = rangeBounds(range);
      setRows(await fetchEarnings(coach.id, from, to));
    }
    setLoading(false);
  }, [user, range, dirty]);

  useFocusEffect(useCallback(() => {
    load();
    // Coming back from Stripe onboarding in the in-app browser → refresh status.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    return () => sub.remove();
  }, [load]));

  const totals = useMemo(() => earningsTotals(rows), [rows]);
  const example = preview(8000, fee, bps);

  const connect = async () => {
    tapLight();
    setBusy(true);
    const { error } = await startConnectOnboarding();
    setBusy(false);
    if (error) { notifyError(); alertMsg('Stripe setup', error.message); return; }
    load();
  };

  const saveSettings = async () => {
    const h = Math.min(Math.max(parseInt(hours, 10) || 24, 1), 168);
    setBusy(true);
    const { error } = await savePaymentSettings(timing, h, fee);
    setBusy(false);
    if (error) { notifyError(); alertMsg("Couldn't save", error.message); return; }
    notifySuccess();
    setDirty(false);
    setHours(String(h));
    alertMsg('Saved', 'Applies to lessons booked from now on.');
  };

  const exportCsv = async () => {
    const csv = earningsCsv(rows);
    const name = `rallyhub-earnings-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    } else {
      await Share.share({ title: name, message: csv });
    }
  };

  const Radio = ({ on, title, sub, onPress }: { on: boolean; title: string; sub?: string; onPress: () => void }) => (
    <Pressable onPress={() => { tapLight(); onPress(); setDirty(true); }} className="flex-row items-start py-2 active:opacity-70">
      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? '#3B82B0' : '#8FA8BF'} />
      <View className="ml-2 flex-1">
        <Text className="text-sm font-semibold text-bark dark:text-cream">{title}</Text>
        {sub ? <Text className="text-xs text-stone dark:text-parchment">{sub}</Text> : null}
      </View>
    </Pressable>
  );

  const connected = !!status?.charges_enabled;
  const submitted = !!status?.details_submitted;

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Payments</Text>
        <View className="w-6" />
      </View>

      {loading ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* Stripe connection */}
          <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: connected ? '#16a34a14' : '#3B82B014', borderWidth: 1, borderColor: connected ? '#16a34a40' : '#3B82B040' }}>
            <View className="flex-row items-center mb-1">
              <Ionicons name={connected ? 'checkmark-circle' : 'card-outline'} size={20} color={connected ? '#16a34a' : '#3B82B0'} />
              <Text className="text-base font-bold text-bark dark:text-cream ml-2">
                {connected ? 'Getting paid in RallyHUB' : submitted ? 'Stripe is verifying you' : 'Get paid in the app'}
              </Text>
            </View>
            <Text className="text-xs text-stone dark:text-parchment mb-3 leading-5">
              {connected
                ? 'Families pay by card, Apple Pay, Google Pay, or bank transfer. Money goes to your bank on Stripe\'s payout schedule.'
                : submitted
                  ? 'Usually a few minutes, sometimes a day. You can keep taking bookings and recording cash meanwhile.'
                  : 'Connect a bank account through Stripe (about 5 minutes: name, birthday, last 4 of SSN, bank). Until then you can take bookings and record cash.'}
            </Text>
            {connected ? (
              <Pressable onPress={() => openStripeDashboard()} className="self-start rounded-lg px-3 py-2 bg-warm-white dark:bg-bark-light active:opacity-70">
                <Text className="text-xs font-semibold text-rally-600">Open Stripe dashboard →</Text>
              </Pressable>
            ) : (
              <Pressable disabled={busy} onPress={connect} className="bg-rally-600 rounded-xl py-3 items-center active:opacity-80">
                <Text className="text-sm font-bold text-cream">{busy ? 'Opening Stripe…' : submitted ? 'Continue Stripe setup' : 'Set up payouts with Stripe'}</Text>
              </Pressable>
            )}
          </View>

          {/* Earnings */}
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-stone ml-1">Earnings</Text>
            <View className="flex-row bg-parchment dark:bg-bark-light rounded-lg p-0.5">
              {(['week', 'month', 'year'] as Range[]).map((r) => (
                <Pressable key={r} onPress={() => { setRange(r); setLoading(true); }} className={`px-3 py-1 rounded-md ${range === r ? 'bg-warm-white dark:bg-bark' : ''}`}>
                  <Text className={`text-xs font-semibold ${range === r ? 'text-bark dark:text-cream' : 'text-stone'}`}>{r[0].toUpperCase() + r.slice(1)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View className="flex-row flex-wrap -mx-1 mb-1">
            {[
              { l: 'Booked', v: totals.booked, c: '#1E3A5F', s: `${totals.lessons} lessons` },
              { l: 'Collected', v: totals.collected, c: '#16a34a', s: 'card, bank + cash' },
              { l: 'Outstanding', v: totals.outstanding, c: totals.outstanding ? '#dc2626' : '#8FA8BF', s: 'not yet paid' },
              { l: 'Cash recorded', v: totals.cash, c: '#0d9488', s: 'marked paid' },
              { l: 'RallyHUB fees', v: totals.fees, c: '#8FA8BF', s: `${bps / 100}% of in-app` },
              { l: 'Refunded', v: totals.refunded, c: '#8FA8BF', s: 'back to families' },
            ].map((t) => (
              <View key={t.l} style={{ width: '33.33%' }} className="px-1 mb-2">
                <View className="bg-warm-white dark:bg-bark-light rounded-xl px-2.5 py-2 border border-parchment dark:border-rally-900">
                  <Text className="text-[10px] font-semibold uppercase text-stone">{t.l}</Text>
                  <Text className="text-base font-bold" style={{ color: t.c }}>{fmtMoney(t.v)}</Text>
                  <Text className="text-[10px] text-stone">{t.s}</Text>
                </View>
              </View>
            ))}
          </View>
          <Pressable onPress={exportCsv} className="self-end flex-row items-center mb-4 active:opacity-70">
            <Ionicons name="download-outline" size={14} color="#3B82B0" />
            <Text className="text-xs font-semibold text-rally-600 ml-1">Export CSV (for taxes)</Text>
          </Pressable>

          {/* Payouts */}
          {connected && payouts && (
            <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
              <Text className="text-sm font-bold text-bark dark:text-cream mb-2">Payouts</Text>
              <View className="flex-row mb-2">
                <Text className="text-xs text-stone flex-1">Available {fmtMoney(payouts.available_cents)}</Text>
                <Text className="text-xs text-stone">On the way {fmtMoney(payouts.pending_cents)}</Text>
              </View>
              {payouts.payouts.length === 0 ? (
                <Text className="text-xs text-stone">No payouts yet.</Text>
              ) : payouts.payouts.map((p) => (
                <View key={p.id} className="flex-row items-center py-1.5 border-t border-parchment dark:border-rally-900">
                  <Text className="text-sm font-semibold text-bark dark:text-cream flex-1">{fmtMoney(p.amount_cents)}</Text>
                  <Text className="text-xs text-stone mr-2">{new Date(p.arrival_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{p.bank_last4 ? ` · ••${p.bank_last4}` : ''}</Text>
                  <Text className="text-[10px] font-bold" style={{ color: p.status === 'paid' ? '#16a34a' : p.status === 'failed' ? '#dc2626' : '#b45309' }}>{p.status.replace('_', ' ').toUpperCase()}</Text>
                </View>
              ))}
            </View>
          )}

          {/* When to charge */}
          <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
            <Text className="text-sm font-bold text-bark dark:text-cream mb-1">When families are charged</Text>
            <Radio on={timing === 'on_accept'} title="When I accept the request" sub="Default. Paid up front; refunds follow your terms." onPress={() => setTiming('on_accept')} />
            <Radio on={timing === 'hours_before'} title="Before the lesson" sub="Charged a set number of hours ahead." onPress={() => setTiming('hours_before')} />
            {timing === 'hours_before' && (
              <View className="flex-row items-center ml-7 mb-1">
                <TextInput
                  value={hours}
                  onChangeText={(v) => { setHours(v.replace(/\D/g, '')); setDirty(true); }}
                  keyboardType="number-pad"
                  className="bg-cream dark:bg-bark rounded-lg px-3 py-1.5 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900 w-16 text-center"
                />
                <Text className="text-xs text-stone ml-2">hours before</Text>
              </View>
            )}
            <Radio on={timing === 'after_lesson'} title="After the lesson" sub="Charged about 2 hours after it ends." onPress={() => setTiming('after_lesson')} />
          </View>

          {/* Processing fees */}
          <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
            <Text className="text-sm font-bold text-bark dark:text-cream mb-1">Card processing fees</Text>
            <Radio on={fee === 'absorb'} title="I'll cover them" sub="Families pay exactly your price." onPress={() => setFee('absorb')} />
            <Radio on={fee === 'surcharge'} title="Families pay a service fee" sub="Added at checkout to cover processing." onPress={() => setFee('surcharge')} />
            <View className="bg-cream dark:bg-bark rounded-lg px-3 py-2 mt-1">
              <Text className="text-xs text-stone dark:text-parchment">
                On an $80 card lesson: family pays <Text className="font-bold text-bark dark:text-cream">{fmtMoney(example.parentPays)}</Text>, you receive <Text className="font-bold text-bark dark:text-cream">{fmtMoney(example.youGet)}</Text> (RallyHUB {bps / 100}%{fee === 'absorb' ? ' + Stripe ~2.9% + 30¢' : ''}). Bank transfers cost less.
              </Text>
            </View>
            {fee === 'surcharge' && (
              <Text className="text-[11px] text-stone mt-2">Some states restrict card surcharges. Check your state's rules.</Text>
            )}
          </View>

          {dirty && (
            <Pressable disabled={busy} onPress={saveSettings} className="bg-rally-600 rounded-xl py-3 items-center active:opacity-80">
              <Text className="text-sm font-bold text-cream">{busy ? 'Saving…' : 'Save payment settings'}</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
