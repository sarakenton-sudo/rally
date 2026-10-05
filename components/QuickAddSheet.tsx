import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { usePlusSheetOrder } from '@/lib/usePlusContext';
import { PLANS_INBOX_EMAIL } from '@/lib/config';
import { showToast } from '@/components/Toast';
import { trackEvent } from '@/lib/track-event';
import { tapLight } from '@/lib/haptics';
import type { TopItem } from '@/lib/plusSheet';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fmtHour = (h: number, m: number) => {
  const ampm = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 || 12;
  return m ? `${hh}:${String(m).padStart(2, '0')}${ampm}` : `${hh}${ampm}`;
};

/**
 * The "+" quick-add sheet (spec: "+" Quick-Add Sheet). Paste input is always
 * first; the three top-tier items are ordered by getPlusSheetOrder(); setup
 * items sit below a divider.
 */
export default function QuickAddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const athletes = useSeasonStore((s) => s.athletes);
  const { order, refresh, hasCoach, nextTravel } = usePlusSheetOrder();
  const [text, setText] = useState('');
  const [fromClipboard, setFromClipboard] = useState(false);
  const [clipboardHasText, setClipboardHasText] = useState(false);
  const [expanded, setExpanded] = useState<'travel' | 'setup' | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const openedTracked = useRef(false);

  const track = (event: string, props: Record<string, unknown> = {}) => { if (user) trackEvent(user.id, event, props); };

  useEffect(() => {
    if (!visible) { openedTracked.current = false; setExpanded(null); return; }
    refresh();
    // hasStringAsync doesn't read the clipboard, so iOS shows no paste banner;
    // the text is only read when the parent taps the chip.
    Clipboard.hasStringAsync().then(setClipboardHasText).catch(() => setClipboardHasText(false));
  }, [visible]);

  useEffect(() => {
    if (visible && !openedTracked.current) {
      openedTracked.current = true;
      track('plus_sheet_opened', { top_item: order.topItems[0], rule_applied: order.rule });
    }
  }, [visible, order.rule]);

  const go = (path: string, params?: Record<string, string>) => {
    onClose();
    if (params) router.push({ pathname: path as any, params });
    else router.push(path as any);
  };

  const pasteFromClipboard = async () => {
    const v = await Clipboard.getStringAsync();
    if (v) { setText(v); setFromClipboard(true); }
  };

  const submitPaste = () => {
    const t = text.trim();
    if (!t) return;
    track('paste_submitted', { source: fromClipboard ? 'clipboard' : 'typed', char_count: t.length });
    setText('');
    setFromClipboard(false);
    go('/import/paste-combined', { text: t, auto: '1' });
  };

  const copyForward = async () => {
    await Clipboard.setStringAsync(PLANS_INBOX_EMAIL);
    tapLight();
    track('forward_email_copied');
    showToast('Copied — forward away');
  };

  const tapItem = (item: string, position: number) => track('plus_item_tapped', { item, position });

  const rebookLabel = order.rebook
    ? `Rebook ${order.rebook.coachName} · ${WEEKDAY[order.rebook.weekday]} ${fmtHour(order.rebook.hour, order.rebook.minute)}`
    : null;

  const Row = ({ icon, color, title, subtitle, onPress, a11y, children }: {
    icon: keyof typeof Ionicons.glyphMap; color: string; title: string; subtitle?: string | null; onPress: () => void; a11y?: string; children?: React.ReactNode;
  }) => (
    <View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11y ?? [title, subtitle].filter(Boolean).join(', ')}
        className="flex-row items-center px-4 py-3.5 active:opacity-70"
      >
        <View className="w-11 h-11 rounded-full items-center justify-center mr-3" style={{ backgroundColor: color + '18' }}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-bark dark:text-cream">{title}</Text>
          {subtitle ? <Text className="text-xs text-stone dark:text-parchment mt-0.5">{subtitle}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color="#8FA8BF" />
      </Pressable>
      {children}
    </View>
  );

  const SubOption = ({ label, icon, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="flex-row items-center pl-[72px] pr-4 py-2.5 active:opacity-70">
      <Ionicons name={icon} size={16} color="#3B82B0" />
      <Text className="text-sm font-semibold text-rally-600 ml-2">{label}</Text>
    </Pressable>
  );

  const renderTop = (item: TopItem, i: number) => {
    if (item === 'travel') {
      return (
        <Row
          key="travel" icon="bed-outline" color="#3B82B0" title="Add travel"
          subtitle={order.travelSubtitle ?? 'Hotel, flight, or backup hotel'}
          onPress={() => { tapItem('travel', i + 1); setExpanded(expanded === 'travel' ? null : 'travel'); }}
        >
          {expanded === 'travel' && (
            <View className="pb-2">
              <SubOption label="Hotel" icon="bed-outline" onPress={() => go('/booking/add-hotel', nextTravel ? { tournamentId: nextTravel.id } : undefined)} />
              <SubOption label="Flight" icon="airplane-outline" onPress={() => go('/booking/add-flight', nextTravel ? { tournamentId: nextTravel.id } : undefined)} />
              {/* No dedicated "other travel" form yet: paste it and let the reader sort it out. */}
              <SubOption label="Other (paste a confirmation)" icon="document-text-outline" onPress={() => go('/import/paste-combined')} />
            </View>
          )}
        </Row>
      );
    }
    if (item === 'lesson') {
      return (
        <Row
          key="lesson" icon="person-outline" color="#3B82B0" title="Book a lesson"
          subtitle={rebookLabel ?? (hasCoach ? 'See your coaches’ open times' : 'Invite your coach or enter their link')}
          a11y={order.rebook ? `Book a lesson. Rebook lesson with ${order.rebook.coachName}, ${WEEKDAY_LONG[order.rebook.weekday]} ${fmtHour(order.rebook.hour, order.rebook.minute)}` : undefined}
          onPress={() => { tapItem('lesson', i + 1); go('/lessons'); }}
        />
      );
    }
    return (
      <Row
        key="login" icon="key-outline" color="#7c3aed" title="Save a login or code"
        subtitle="Team code, USAV ID, AES, LeagueApps…"
        onPress={() => { tapItem('login', i + 1); go('/profile/edit-link'); }}
      />
    );
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

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          {/* 1. Paste / forward */}
          <View className="mx-4 mb-3 bg-warm-white dark:bg-bark-light rounded-2xl p-3 border border-parchment dark:border-rally-900">
            {clipboardHasText && !text && (
              <Pressable onPress={pasteFromClipboard} className="flex-row items-center self-start rounded-full px-3 py-1.5 mb-2 bg-rally-50 dark:bg-rally-900/30 active:opacity-70" accessibilityLabel="Paste from clipboard">
                <Ionicons name="clipboard-outline" size={14} color="#3B82B0" />
                <Text className="text-xs font-semibold text-rally-600 ml-1">Paste from clipboard</Text>
              </Pressable>
            )}
            <TextInput
              value={text}
              onChangeText={(v) => { setText(v); if (!v) setFromClipboard(false); }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Paste anything — hotel, flight, schedule, team code"
              placeholderTextColor="#8FA8BF"
              multiline
              textAlignVertical="top"
              accessibilityLabel="Paste anything"
              className="text-sm text-bark dark:text-cream"
              style={{ minHeight: inputFocused || text ? 140 : 56 }}
            />
            {text.trim() ? (
              <Pressable onPress={submitPaste} className="bg-rally-600 rounded-xl py-2.5 items-center mt-2 active:opacity-80" accessibilityLabel="Read it">
                <Text className="text-sm font-bold text-cream">Read it</Text>
              </Pressable>
            ) : null}
            <View className="flex-row items-center mt-2 pt-2 border-t border-parchment dark:border-rally-900">
              <Text className="text-xs text-stone dark:text-parchment flex-1">
                Or forward confirmations to <Text className="font-semibold text-bark dark:text-cream">{PLANS_INBOX_EMAIL}</Text>
              </Text>
              <Pressable onPress={copyForward} className="p-1.5 active:opacity-60" accessibilityLabel={`Copy ${PLANS_INBOX_EMAIL}`}>
                <Ionicons name="copy-outline" size={16} color="#3B82B0" />
              </Pressable>
            </View>
          </View>

          {/* 4.3 setup prompts */}
          {order.setupPrompts.map((p) => (
            <Pressable
              key={p}
              onPress={() => go(p === 'add_athlete' ? '/settings/add-athlete' : '/settings/add-season', p === 'add_season' && athletes[0] ? { athleteId: athletes[0].id } : undefined)}
              className="mx-4 mb-2 flex-row items-center rounded-2xl p-3.5 active:opacity-80"
              style={{ backgroundColor: '#d977061a', borderWidth: 1, borderColor: '#d9770640' }}
            >
              <Ionicons name={p === 'add_athlete' ? 'person-add' : 'calendar'} size={20} color="#b45309" />
              <Text className="text-sm font-bold ml-2 flex-1" style={{ color: '#b45309' }}>
                Start here: {p === 'add_athlete' ? 'add your athlete' : 'add your first season'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#b45309" />
            </Pressable>
          ))}

          {/* 2. Top tier (context-ordered) */}
          <View className="mx-4 bg-warm-white dark:bg-bark-light rounded-2xl border border-parchment dark:border-rally-900 overflow-hidden">
            {order.topItems.map((item, i) => (
              <View key={item} className={i ? 'border-t border-parchment dark:border-rally-900' : ''}>{renderTop(item, i)}</View>
            ))}
          </View>

          {/* 3. Setup tier */}
          <View className="mx-4 mt-5 flex-row items-center">
            <View className="flex-1 h-px bg-parchment dark:bg-rally-900" />
            <Text className="text-[11px] font-semibold uppercase tracking-wider text-stone mx-2">Setup</Text>
            <View className="flex-1 h-px bg-parchment dark:bg-rally-900" />
          </View>
          <View className="mx-4 mt-2">
            <Pressable onPress={() => { tapItem('season', 4); setExpanded(expanded === 'setup' ? null : 'setup'); }} className="flex-row items-center py-2.5 active:opacity-70" accessibilityLabel="Add a tournament or season">
              <Ionicons name="calendar-outline" size={18} color="#6A9E8A" />
              <Text className="text-sm font-semibold text-stone dark:text-parchment ml-2.5 flex-1">Add a tournament or season</Text>
              <Ionicons name={expanded === 'setup' ? 'chevron-down' : 'chevron-forward'} size={14} color="#8FA8BF" />
            </Pressable>
            {expanded === 'setup' && (
              <View className="pl-7 pb-1">
                <Pressable onPress={() => go('/tournament/add')} className="py-2"><Text className="text-sm font-semibold text-rally-600">Tournament</Text></Pressable>
                <Pressable onPress={() => go('/settings/add-season', athletes[0] ? { athleteId: athletes[0].id } : undefined)} className="py-2"><Text className="text-sm font-semibold text-rally-600">Season / new team</Text></Pressable>
                <Pressable onPress={() => go('/import/paste-combined')} className="py-2"><Text className="text-sm font-semibold text-rally-600">Paste a season schedule</Text></Pressable>
                <Text className="text-[11px] text-stone py-1">Import from LeagueApps, TeamSnap, or Auto-Sync — coming soon</Text>
              </View>
            )}
            <Pressable onPress={() => { tapItem('team_event', 5); go('/booking/add-team-event'); }} className="flex-row items-center py-2.5 active:opacity-70" accessibilityLabel="Add a team event">
              <Ionicons name="restaurant-outline" size={18} color="#6A9E8A" />
              <Text className="text-sm font-semibold text-stone dark:text-parchment ml-2.5 flex-1">Add a team event</Text>
              <Ionicons name="chevron-forward" size={14} color="#8FA8BF" />
            </Pressable>
            <Pressable onPress={() => { tapItem('athlete', 6); go('/settings/add-athlete'); }} className="py-3 active:opacity-70" accessibilityLabel="Add an athlete">
              <Text className="text-xs font-semibold text-rally-600">+ Add an athlete</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
