import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fmtMoney, isSupabaseConfigured } from '@/lib/coach';
import {
  getPaymentMethod, addPaymentMethod, confirmPaymentMethod, removePaymentMethod, describePaymentMethod,
  fetchMyCharges, openReceipt, type SavedPaymentMethod, type ParentCharge,
} from '@/lib/payments';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError, tapLight } from '@/lib/haptics';

const OFFLINE = ['cash', 'venmo', 'zelle', 'other'];

function chargeStatus(c: ParentCharge): { label: string; color: string } {
  if (c.payment_status === 'refunded') return { label: 'Refunded', color: '#6B8BA8' };
  if (c.status === 'cancelled') return { label: 'Cancelled', color: '#6B8BA8' };
  if (c.payment_status === 'captured') return { label: OFFLINE.includes(c.payment_method ?? '') ? `Paid (${c.payment_method})` : 'Paid', color: '#16a34a' };
  if (c.payment_status === 'processing') return { label: 'Bank transfer processing', color: '#3B82B0' };
  if (c.payment_status === 'failed') return { label: 'Payment failed', color: '#dc2626' };
  if (c.charge_due_at) {
    const due = new Date(c.charge_due_at);
    return due > new Date()
      ? { label: `Charges ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, color: '#b45309' }
      : { label: 'Charging soon', color: '#b45309' };
  }
  return { label: 'Pay coach directly', color: '#6B8BA8' };
}

export default function PaymentSettingsScreen() {
  const ic = useIconColors();
  const { pm_setup, session_id } = useLocalSearchParams<{ pm_setup?: string; session_id?: string }>();
  const [pm, setPm] = useState<SavedPaymentMethod | null>(null);
  const [charges, setCharges] = useState<ParentCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const alertMsg = (t: string, m: string) => (Platform.OS === 'web' ? window.alert(`${t}: ${m}`) : Alert.alert(t, m));

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    // Back from Stripe Checkout on web → save the new method first.
    const [pmRes, ch] = await Promise.all([
      pm_setup === 'success' && session_id ? confirmPaymentMethod(session_id) : getPaymentMethod().then((r) => ({ data: r.data?.payment_method ?? null, error: r.error })),
      fetchMyCharges(),
    ]);
    setPm(pmRes.data);
    setCharges(ch);
    setLoading(false);
  }, [pm_setup, session_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addOrReplace = async () => {
    tapLight();
    setBusy(true);
    const { data, error } = await addPaymentMethod('/settings/payments');
    setBusy(false);
    if (error) { notifyError(); alertMsg('Payment method', error.message); return; }
    if (data) { setPm(data); notifySuccess(); }
  };

  const remove = () => {
    const go = async () => {
      setBusy(true);
      const { error } = await removePaymentMethod();
      setBusy(false);
      if (error) { notifyError(); alertMsg("Couldn't remove", error.message); return; }
      setPm(null);
      notifySuccess();
    };
    const msg = 'Upcoming lessons with coaches who charge in RallyHUB will need a new payment method before they can be charged.';
    if (Platform.OS === 'web') { if (window.confirm(`Remove this payment method? ${msg}`)) go(); }
    else Alert.alert('Remove payment method?', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };

  const receipt = async (id: string) => {
    const { error } = await openReceipt(id);
    if (error) alertMsg('Receipt', error.message);
  };

  const failed = charges.filter((c) => c.payment_status === 'failed' && c.status === 'confirmed');
  const isBank = pm?.pm_type === 'us_bank_account';

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Payments</Text>
        <View className="w-6" />
      </View>

      {loading ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {failed.length > 0 && (
            <View className="flex-row items-start rounded-xl p-3 mb-4" style={{ backgroundColor: '#dc26261a' }}>
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text className="text-xs ml-2 flex-1" style={{ color: '#dc2626' }}>
                {failed.length} lesson payment{failed.length === 1 ? '' : 's'} didn't go through. Update your payment method below — we'll retry automatically.
              </Text>
            </View>
          )}

          {/* Payment method */}
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Payment method</Text>
          <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2">
            {pm ? (
              <View className="flex-row items-center">
                <View className="w-11 h-11 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#3B82B01a' }}>
                  <Ionicons name={isBank ? 'business' : 'card'} size={20} color="#3B82B0" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-bark dark:text-cream">{describePaymentMethod(pm)}</Text>
                  <Text className="text-xs text-stone dark:text-parchment">{isBank ? 'Bank account (ACH)' : 'Card'} · used for every coach</Text>
                </View>
              </View>
            ) : (
              <Text className="text-sm text-stone dark:text-parchment">No payment method yet. Add one to book lessons with coaches who take payments in RallyHUB.</Text>
            )}
            <View className="flex-row mt-3">
              <Pressable disabled={busy} onPress={addOrReplace} className="bg-rally-600 rounded-lg px-4 py-2.5 mr-2 active:opacity-80">
                <Text className="text-sm font-semibold text-cream">{busy ? 'Opening…' : pm ? 'Replace' : 'Add bank account or card'}</Text>
              </Pressable>
              {pm && (
                <Pressable disabled={busy} onPress={remove} className="rounded-lg px-4 py-2.5 active:opacity-70">
                  <Text className="text-sm font-semibold text-red-600">Remove</Text>
                </Pressable>
              )}
            </View>
          </View>
          <View className="flex-row items-start px-1 mb-5">
            <Ionicons name="information-circle-outline" size={14} color={ic.muted} style={{ marginTop: 1 }} />
            <Text className="text-[11px] text-stone dark:text-parchment ml-1 flex-1 leading-4">
              One payment method covers all your coaches and sports. {isBank ? '' : 'A bank account (ACH) is cheapest — if a coach passes fees on, it’s about $0.64 on an $80 lesson vs. about $2.70 by card. '}Secured by Stripe; RallyHUB never sees your full card or bank number.
            </Text>
          </View>

          {/* History */}
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Lesson payments</Text>
          {charges.length === 0 ? (
            <Text className="text-xs text-stone dark:text-parchment ml-1">No lessons yet.</Text>
          ) : (
            <View className="bg-warm-white dark:bg-bark-light rounded-xl px-4 border border-parchment dark:border-rally-900">
              {charges.map((c, i) => {
                const st = chargeStatus(c);
                const amount = c.amount_charged_cents ?? c.price_cents;
                const inApp = !!c.amount_charged_cents && !OFFLINE.includes(c.payment_method ?? '');
                return (
                  <View key={c.id} className={`py-3 ${i ? 'border-t border-parchment dark:border-rally-900' : ''}`}>
                    <View className="flex-row items-center">
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-bark dark:text-cream">
                          {c.coaches?.display_name ?? 'Coach'}{c.athletes?.first_name ? ` · ${c.athletes.first_name}` : ''}
                        </Text>
                        <Text className="text-xs text-stone dark:text-parchment">
                          {c.slots?.starts_at ? new Date(c.slots.starts_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : ''}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-sm font-bold text-bark dark:text-cream">{fmtMoney(amount)}</Text>
                        <Text className="text-[11px] font-semibold" style={{ color: st.color }}>{st.label}</Text>
                      </View>
                    </View>
                    {c.payment_status === 'failed' && c.last_charge_error ? (
                      <Text className="text-[11px] text-red-600 mt-1">{c.last_charge_error}</Text>
                    ) : null}
                    {c.refunded_cents > 0 ? (
                      <Text className="text-[11px] text-stone mt-1">Refunded {fmtMoney(c.refunded_cents)}</Text>
                    ) : null}
                    {inApp && ['captured', 'refunded'].includes(c.payment_status) ? (
                      <Pressable onPress={() => receipt(c.id)} className="mt-1 self-start">
                        <Text className="text-xs font-semibold text-rally-600">Receipt</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
