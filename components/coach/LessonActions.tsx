import { useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import {
  markBookingPaid, markBookingUnpaid, coachCancelBooking, coachProposeReschedule, coachWithdrawReschedule, fetchUpcomingSlots,
  paymentBadge, PAYMENT_BADGE_STYLE, fmtMoney, type ScheduleAttendee, type SlotWithRefs,
} from '@/lib/coach';
import { notifySuccess, notifyError, tapLight } from '@/lib/haptics';

const OFFLINE_METHODS = [
  { key: 'cash', label: 'Cash' },
  { key: 'venmo', label: 'Venmo' },
  { key: 'zelle', label: 'Zelle' },
  { key: 'other', label: 'Other' },
] as const;

const fmtSlot = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

/** Mark paid / cancel / reschedule for one confirmed lesson (one attendee). */
export default function LessonActions({ attendee, slotId, startsAt, coachId, onChanged }: {
  attendee: ScheduleAttendee;
  slotId: string;
  startsAt: string;
  coachId: string;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'none' | 'cancel' | 'reschedule'>('none');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [options, setOptions] = useState<SlotWithRefs[] | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  const badge = paymentBadge(attendee, startsAt);
  const badgeStyle = PAYMENT_BADGE_STYLE[badge];
  const offline = ['cash', 'venmo', 'zelle', 'other'].includes(attendee.payment_method ?? '');

  const fail = (t: string, e: Error) => {
    notifyError();
    if (Platform.OS === 'web') window.alert(`${t}: ${e.message}`);
    else Alert.alert(t, e.message);
  };

  const run = async (fn: () => Promise<{ error: Error | null }>, errTitle: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return fail(errTitle, error);
    notifySuccess();
    setMode('none');
    setReason('');
    setTarget(null);
    onChanged();
  };

  const openReschedule = async () => {
    tapLight();
    setMode('reschedule');
    if (options) return;
    const { data } = await fetchUpcomingSlots(coachId);
    setOptions(data.filter((s) => s.id !== slotId && s.status === 'open' && s.seats_taken < s.seats_total).slice(0, 10));
  };

  return (
    <View className="mt-2">
      {/* Payment */}
      <View className="flex-row items-center flex-wrap">
        <View className="rounded-md px-2 py-0.5 mr-2 mb-1" style={{ backgroundColor: badgeStyle.bg }}>
          <Text className="text-[10px] font-bold" style={{ color: badgeStyle.fg }}>
            {badgeStyle.label}{attendee.price_cents ? ` · ${fmtMoney(attendee.price_cents)}` : ''}
            {badge === 'paid' && attendee.payment_method ? ` · ${attendee.payment_method.toUpperCase()}` : ''}
          </Text>
        </View>
        {badge === 'processing' || badge === 'refunded' ? null : badge === 'paid' ? (
          offline ? (
            <Pressable disabled={busy} onPress={() => run(() => markBookingUnpaid(attendee.id), "Couldn't undo")} className="mb-1">
              <Text className="text-xs text-stone underline">Undo</Text>
            </Pressable>
          ) : null
        ) : (
          <>
            <Text className="text-xs text-stone mr-1.5 mb-1">Mark paid:</Text>
            {OFFLINE_METHODS.map((m) => (
              <Pressable
                key={m.key}
                disabled={busy}
                onPress={() => run(() => markBookingPaid(attendee.id, m.key), "Couldn't mark paid")}
                className="rounded-full px-2.5 py-1 mr-1.5 mb-1 border border-green-600/40 active:opacity-70"
              >
                <Text className="text-xs font-semibold text-green-700 dark:text-green-400">{m.label}</Text>
              </Pressable>
            ))}
          </>
        )}
        {busy && <ActivityIndicator size="small" color="#3B82B0" className="ml-1" />}
      </View>

      {/* Waiting on the family to accept a new time */}
      {attendee.proposed_starts_at ? (
        <View className="flex-row items-center flex-wrap mt-1.5 rounded-lg px-2.5 py-1.5" style={{ backgroundColor: '#d977061a' }}>
          <Text className="text-xs font-semibold flex-1" style={{ color: '#b45309' }}>
            Asked to move to {fmtSlot(attendee.proposed_starts_at)} · waiting for the family
          </Text>
          <Pressable disabled={busy} onPress={() => run(() => coachWithdrawReschedule(attendee.id), "Couldn't withdraw")} className="ml-2">
            <Text className="text-xs font-semibold text-stone underline">Withdraw</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Reschedule / cancel */}
      {mode === 'none' && (
        <View className="flex-row mt-1.5">
          <Pressable onPress={openReschedule} className="rounded-lg px-3 py-1.5 mr-2 bg-rally-50 dark:bg-rally-900/30 active:opacity-70">
            <Text className="text-xs font-semibold text-rally-600">{attendee.proposed_starts_at ? 'Offer a different time' : 'Reschedule'}</Text>
          </Pressable>
          <Pressable onPress={() => { tapLight(); setMode('cancel'); }} className="rounded-lg px-3 py-1.5 bg-red-50 dark:bg-red-900/20 active:opacity-70">
            <Text className="text-xs font-semibold text-red-600">Cancel lesson</Text>
          </Pressable>
        </View>
      )}

      {mode !== 'none' && (
        <View className="mt-2 rounded-xl p-3 border border-parchment dark:border-rally-900 bg-cream dark:bg-bark">
          {mode === 'reschedule' && (
            <>
              <Text className="text-xs font-semibold text-bark dark:text-cream mb-1.5">Offer one of your open times:</Text>
              {options === null ? (
                <ActivityIndicator size="small" color="#3B82B0" />
              ) : options.length === 0 ? (
                <Text className="text-xs text-stone mb-2">No open times coming up. Add availability first.</Text>
              ) : (
                <View className="flex-row flex-wrap mb-1">
                  {options.map((o) => {
                    const on = target === o.id;
                    return (
                      <Pressable
                        key={o.id}
                        onPress={() => setTarget(o.id)}
                        className={`rounded-lg px-2.5 py-1.5 mr-1.5 mb-1.5 border ${on ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-rally-900'}`}
                      >
                        <Text className={`text-xs font-semibold ${on ? 'text-cream' : 'text-bark dark:text-cream'}`}>{fmtSlot(o.starts_at)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </>
          )}
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={mode === 'cancel' ? 'Reason for the family (optional)' : 'Note for the family (optional)'}
            placeholderTextColor="#8FA8BF"
            className="bg-warm-white dark:bg-bark-light rounded-lg px-3 py-2 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900"
          />
          <Text className="text-[11px] text-stone mt-1">
            {mode === 'reschedule'
              ? 'The family gets a push, email and in-app request to accept. The lesson stays at its current time until they do; the new time is held for them.'
              : 'The family gets a push, an email and an in-app notice.'}
          </Text>
          <View className="flex-row mt-2">
            {mode === 'cancel' ? (
              <Pressable
                disabled={busy}
                onPress={() => run(() => coachCancelBooking(attendee.id, reason), "Couldn't cancel")}
                className="rounded-lg px-3 py-2 mr-2 bg-red-600 active:opacity-80"
              >
                <Text className="text-xs font-bold text-white">{busy ? 'Cancelling…' : 'Cancel lesson'}</Text>
              </Pressable>
            ) : (
              <Pressable
                disabled={busy || !target}
                onPress={() => target && run(() => coachProposeReschedule(attendee.id, target, reason), "Couldn't send the new time")}
                className={`rounded-lg px-3 py-2 mr-2 ${target ? 'bg-rally-600 active:opacity-80' : 'bg-parchment'}`}
              >
                <Text className="text-xs font-bold text-white">{busy ? 'Sending…' : 'Ask the family'}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => { setMode('none'); setReason(''); setTarget(null); }} className="rounded-lg px-3 py-2">
              <Text className="text-xs font-semibold text-stone">Never mind</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
