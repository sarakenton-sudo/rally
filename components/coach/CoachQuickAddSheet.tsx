import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, Share, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useCoachStore } from '@/stores/useCoachStore';
import {
  fetchPendingRequests, fetchUnpaidLessons, countOpenSlotsNext7Days, familyInviteMessage, isSupabaseConfigured,
} from '@/lib/coach';
import { bookingPageUrl } from '@/lib/bookingPage';
import { getCoachPlusOrder, type CoachPlusOrder, type CoachTopItem } from '@/lib/coachPlus';
import { showToast } from '@/components/Toast';
import { trackEvent } from '@/lib/track-event';
import { tapLight } from '@/lib/haptics';

/**
 * Coach "+" — frequent tasks in 1–2 taps. Top tier ordered by
 * getCoachPlusOrder(); pending requests show as a prompt above it.
 */
export default function CoachQuickAddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const coach = useCoachStore((s) => s.coachProfile);
  const [order, setOrder] = useState<CoachPlusOrder>(getCoachPlusOrder({ now: new Date(), pendingRequests: 0, openSlotsNext7Days: 1, unpaidEndedLessons: [] }));
  const [unpaidCount, setUnpaidCount] = useState(0);
  const tracked = useRef(false);

  const track = (event: string, props: Record<string, unknown> = {}) => { if (user) trackEvent(user.id, event, props); };

  useEffect(() => {
    if (!visible) { tracked.current = false; return; }
    if (!coach || !isSupabaseConfigured) return;
    (async () => {
      const [pending, unpaid, open] = await Promise.all([
        fetchPendingRequests(coach.id), fetchUnpaidLessons(coach.id), countOpenSlotsNext7Days(coach.id),
      ]);
      const now = Date.now();
      const ended = unpaid.filter((u) => u.slots && new Date(u.slots.ends_at).getTime() <= now);
      setUnpaidCount(ended.length);
      const o = getCoachPlusOrder({
        now: new Date(), pendingRequests: pending.data.length, openSlotsNext7Days: open,
        unpaidEndedLessons: ended.map((u) => ({ endsAt: u.slots!.ends_at })),
      });
      setOrder(o);
      if (!tracked.current) { tracked.current = true; track('coach_plus_opened', { top_item: o.topItems[0], rule_applied: o.rule, pending: o.reviewPrompt }); }
    })();
  }, [visible, coach?.id]);

  const go = (path: string) => { onClose(); router.push(path as any); };

  const share = async (message: string, event: string) => {
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(message);
      showToast('Copied — paste it into a text');
    } else {
      await Share.share({ message });
    }
    track(event);
  };

  const published = !!(coach as any)?.booking_page_published && !!coach?.slug;

  const ITEMS: Record<CoachTopItem, { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; subtitle: string; run: () => void }> = {
    open_time: {
      icon: 'calendar-outline', color: '#3B82B0', title: 'Add open time',
      subtitle: order.rule === 'no_open_time' ? 'Nothing open in the next 7 days' : 'One-off or recurring',
      run: () => go('/coach/availability-add'),
    },
    book_family: {
      icon: 'person-outline', color: '#be185d', title: 'Book a family',
      subtitle: 'Schedule a lesson for one of your athletes',
      run: () => go('/coach/book-family'),
    },
    record_payment: {
      icon: 'cash-outline', color: '#16a34a', title: 'Record a payment',
      subtitle: unpaidCount ? `${unpaidCount} lesson${unpaidCount === 1 ? '' : 's'} unpaid` : 'Cash, Venmo, Zelle',
      run: () => go('/coach/unpaid'),
    },
    share_link: {
      icon: 'qr-code-outline', color: '#0891b2', title: 'Share my booking link',
      subtitle: published ? 'Link, QR code, or text' : 'Publish your page first',
      run: () => published ? (onClose(), share(`Book a lesson with me on RallyHUB: ${bookingPageUrl(coach!.slug!)}`, 'coach_link_shared')) : go('/coach/booking-page'),
    },
    invite_family: {
      icon: 'person-add-outline', color: '#7c3aed', title: 'Invite a family',
      subtitle: 'Send your code or booking link',
      run: () => { if (coach) { onClose(); share(familyInviteMessage(coach), 'coach_family_invited'); } },
    },
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-cream dark:bg-bark">
        <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
          <Text className="text-xl font-bold text-bark dark:text-cream">Add</Text>
          <Pressable onPress={onClose} className="p-1" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color="#8FA8BF" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {order.reviewPrompt > 0 && (
            <Pressable
              onPress={() => { track('coach_plus_item_tapped', { item: 'review_requests' }); go('/coach/requests'); }}
              className="mx-4 mb-3 flex-row items-center rounded-2xl p-3.5 active:opacity-80"
              style={{ backgroundColor: '#d97706' }}
              accessibilityLabel={`Review ${order.reviewPrompt} lesson requests`}
            >
              <Ionicons name="notifications" size={20} color="#fff" />
              <Text className="text-sm font-bold text-white ml-2 flex-1">
                Review {order.reviewPrompt} lesson request{order.reviewPrompt === 1 ? '' : 's'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </Pressable>
          )}

          <View className="mx-4 bg-warm-white dark:bg-bark-light rounded-2xl border border-parchment dark:border-rally-900 overflow-hidden">
            {order.topItems.map((k, i) => {
              const it = ITEMS[k];
              return (
                <Pressable
                  key={k}
                  onPress={() => { tapLight(); track('coach_plus_item_tapped', { item: k, position: i + 1 }); it.run(); }}
                  className={`flex-row items-center px-4 py-3.5 active:opacity-70 ${i ? 'border-t border-parchment dark:border-rally-900' : ''}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${it.title}, ${it.subtitle}`}
                >
                  <View className="w-11 h-11 rounded-full items-center justify-center mr-3" style={{ backgroundColor: it.color + '18' }}>
                    <Ionicons name={it.icon} size={22} color={it.color} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-bark dark:text-cream">{it.title}</Text>
                    <Text className="text-xs text-stone dark:text-parchment mt-0.5">{it.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#8FA8BF" />
                </Pressable>
              );
            })}
          </View>

          <View className="mx-4 mt-5 flex-row items-center">
            <View className="flex-1 h-px bg-parchment dark:bg-rally-900" />
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-stone mx-2">More</Text>
            <View className="flex-1 h-px bg-parchment dark:bg-rally-900" />
          </View>
          <View className="mx-4 mt-2">
            {([
              ['megaphone-outline', 'Announce open times', '/coach/announce'],
              ['pricetags-outline', 'Add a lesson type', '/coach/session-type-edit'],
              ['business-outline', 'Add a facility', '/coach/facilities'],
            ] as const).map(([icon, label, path]) => (
              <Pressable key={label} onPress={() => { track('coach_plus_item_tapped', { item: path }); go(path); }} className="flex-row items-center py-2.5 active:opacity-70" accessibilityLabel={label}>
                <Ionicons name={icon} size={18} color="#8FA8BF" />
                <Text className="text-sm font-semibold text-stone dark:text-parchment ml-2.5 flex-1">{label}</Text>
                <Ionicons name="chevron-forward" size={14} color="#8FA8BF" />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
