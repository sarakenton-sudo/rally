import { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getPref, setPref } from '@/lib/prefs';
import { targetLabel, targetsFor, type CalendarTarget } from '@/lib/calendarFormat';

// "Add to which calendar?" — an in-app sheet (works on web, where Alert
// buttons don't), opened imperatively from lib/calendar.ts. Mount
// <CalendarChooserHost /> once at the app root.

const LAST_KEY = 'rally.calendarTarget';
type Req = { count: number; noun: string; resolve: (t: CalendarTarget | null) => void };
type Notice = { title: string; body: string; action?: { label: string; url: string } };
let open: ((r: Req) => void) | null = null;
let notify: ((n: Notice) => void) | null = null;

/** Ask where to add; resolves null if dismissed. Remembers the last choice (shown first). */
export function chooseCalendarTarget(count: number, noun: string): Promise<CalendarTarget | null> {
  return new Promise((resolve) => {
    if (!open) { resolve(Platform.OS === 'web' ? 'google' : 'apple'); return; } // host not mounted
    open({ count, noun, resolve: (t) => { if (t) setPref(LAST_KEY, t); resolve(t); } });
  });
}

/** A follow-up note in the same sheet style (e.g. how to import into Google). */
export function showCalendarNotice(n: Notice) {
  notify?.(n);
}

const ICONS: Record<CalendarTarget, keyof typeof Ionicons.glyphMap> = { google: 'logo-google', apple: 'calendar', ics: 'download-outline' };

export function CalendarChooserHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [last, setLast] = useState<CalendarTarget | null>(null);

  useEffect(() => {
    open = (r) => { getPref(LAST_KEY).then((v) => setLast((v as CalendarTarget) || null)); setReq(r); };
    notify = setNotice;
    return () => { open = null; notify = null; };
  }, []);

  const pick = (t: CalendarTarget | null) => { const r = req; setReq(null); r?.resolve(t); };
  const targets = targetsFor(Platform.OS);
  const ordered = last && targets.includes(last) ? [last, ...targets.filter((t) => t !== last)] : targets;
  const visible = !!req || !!notice;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => (req ? pick(null) : setNotice(null))}>
      <Pressable onPress={() => (req ? pick(null) : setNotice(null))} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} className="bg-warm-white dark:bg-bark-light rounded-t-3xl px-5 pt-5 pb-10" style={{ maxWidth: 560, width: '100%', alignSelf: 'center' }}>
          {req ? (
            <>
              <Text className="text-lg font-bold text-bark dark:text-cream">Add to which calendar?</Text>
              <Text className="text-xs text-stone dark:text-parchment mt-1 mb-4">
                {req.count === 1 ? `1 ${req.noun}` : `${req.count} ${req.noun}s`}
              </Text>
              {ordered.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => pick(t)}
                  className="flex-row items-center rounded-xl px-4 py-3.5 mb-2 border border-parchment dark:border-rally-900 active:opacity-70"
                  style={t === last ? { borderColor: '#3B82B0', borderWidth: 1.5 } : undefined}
                  accessibilityRole="button"
                  accessibilityLabel={targetLabel(t, Platform.OS)}
                >
                  <Ionicons name={ICONS[t]} size={20} color="#3B82B0" />
                  <Text className="text-base font-semibold text-bark dark:text-cream ml-3 flex-1">{targetLabel(t, Platform.OS)}</Text>
                  {t === last ? <Text className="text-[11px] font-semibold text-rally-600">Last used</Text> : null}
                </Pressable>
              ))}
              <Pressable onPress={() => pick(null)} className="items-center py-2 mt-1">
                <Text className="text-sm font-semibold text-stone">Cancel</Text>
              </Pressable>
            </>
          ) : notice ? (
            <>
              <Text className="text-lg font-bold text-bark dark:text-cream">{notice.title}</Text>
              <Text className="text-sm text-stone dark:text-parchment mt-2 leading-5">{notice.body}</Text>
              {notice.action ? (
                <Pressable
                  onPress={() => { Linking.openURL(notice.action!.url); setNotice(null); }}
                  className="bg-rally-600 rounded-xl py-3 items-center mt-4 active:opacity-80"
                >
                  <Text className="text-sm font-bold text-cream">{notice.action.label}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setNotice(null)} className="items-center py-2 mt-2">
                <Text className="text-sm font-semibold text-stone">Done</Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
