import { supabase } from '@/lib/supabase';
import { Alert, Linking, Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import { chooseCalendarTarget, showCalendarNotice } from '@/components/CalendarChooser';
import { showToast } from '@/components/Toast';
import {
  buildIcs, googleTemplateUrl, localDate, findGoogleCalendar, findRallyCalendar, pickSourceForNewCalendar,
  withoutDuplicates, GOOGLE_IMPORT_URL, RALLY_CALENDAR_TITLE,
  type CalEvent, type CalendarTarget, type DeviceCalendar,
} from '@/lib/calendarFormat';

// Every "Add to calendar" asks where (Google / Apple / .ics) and remembers the
// last choice. We never write into whatever the phone's default calendar is
// (it can be a shared one, like a school calendar): Apple events go into our
// own "RallyHUB" calendar, Google events into the user's Google calendar.

/** One all-day (possibly multi-day) event, e.g. a tournament. */
export async function addAllDayEventToCalendar(e: {
  title: string; startDate: string; endDate: string; location?: string | null; notes?: string | null;
}) {
  return addEventsToCalendar([{ allDay: true, ...e }], 'tournament');
}

/** Several all-day events at once (Schedule → "Add All to Calendar"). */
export async function addAllDayEventsToCalendar(events: {
  title: string; startDate: string; endDate: string; location?: string | null; notes?: string | null;
}[]): Promise<void> {
  return addEventsToCalendar(events.map((e) => ({ allDay: true as const, ...e })), 'tournament');
}

/** A timed event, e.g. a lesson (ISO start/end). */
export async function addTimedEventToCalendar(e: {
  title: string; start: string; end: string; location?: string | null; notes?: string | null;
}) {
  return addEventsToCalendar([{ allDay: false, ...e }], 'lesson');
}

/** Any mix of events. `noun` is used in the chooser ("3 tournaments"). */
export async function addEventsToCalendar(events: CalEvent[], noun = 'event'): Promise<void> {
  if (!events.length) return;
  const target = await chooseCalendarTarget(events.length, noun);
  if (!target) return;
  try {
    await addTo(target, events, noun);
  } catch (err: any) {
    fail("Couldn't add to your calendar", err?.message ?? 'Please try again.');
  }
}

/** Google "add by URL" link for the family's live calendar feed (00092), or null. */
async function familyFeedGoogleUrl(): Promise<string | null> {
  try {
    const { data, error } = await (supabase.rpc as any)('get_my_family_calendar_token');
    if (error || !data) return null;
    const https = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/family-calendar-feed?token=${data}`;
    return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(https.replace(/^https:/, 'webcal:'))}`;
  } catch { return null; }
}

async function addTo(target: CalendarTarget, events: CalEvent[], noun: string) {
  const many = events.length > 1;
  const what = many ? `${events.length} ${noun}s` : `1 ${noun}`;

  if (target === 'google') {
    if (!many) { await Linking.openURL(googleTemplateUrl(events[0])); return; }
    // Many: subscribe Google Calendar to the family's live feed (tournaments + games).
    // One tap, works with the Google Calendar app or a browser, and stays up to date.
    const feed = await familyFeedGoogleUrl();
    if (feed) {
      await Linking.openURL(feed);
      showCalendarNotice({
        title: 'Adding your RallyHUB calendar to Google',
        body: 'Tap "Add" in Google Calendar. Every tournament and game shows up and stays up to date as your schedule changes. It can take a few hours for Google to show updates.',
      });
      return;
    }
    if (Platform.OS === 'web') {
      // Google has no "add many" link: import one file instead.
      downloadIcs(events);
      showCalendarNotice({
        title: 'One more step in Google Calendar',
        body: `We downloaded rallyhub-calendar.ics with ${what}. In Google Calendar, open Settings → Import & export → Import, choose the file, and pick your calendar.`,
        action: { label: 'Open Google Calendar import', url: GOOGLE_IMPORT_URL },
      });
      return;
    }
    // Phone: write into the Google account that's on this device (it syncs to Google).
    if (!(await ensurePermission())) return;
    const g = findGoogleCalendar(await deviceCalendars());
    if (!g) {
      Alert.alert(
        'Google Calendar isn’t on this phone',
        'To add many at once, add your Google account in Settings → Calendar → Accounts → Add Account → Google, then try again. Or add them to Apple Calendar instead.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Use Apple Calendar', onPress: () => addTo('apple', events, noun).catch((e) => fail("Couldn't add to your calendar", e?.message)) }],
      );
      return;
    }
    const added = await insertInto(g.id, events);
    done(`${added} ${added === 1 ? noun : `${noun}s`} added to Google Calendar (${g.title}).`, events.length - added);
    return;
  }

  if (target === 'ics' || Platform.OS === 'web') {
    // Web "Apple Calendar" = .ics file, which Apple Calendar and Outlook open.
    downloadIcs(events);
    showToast(`Downloaded ${what} — open the file to add ${many ? 'them' : 'it'} to your calendar`);
    return;
  }

  // Apple (iOS) / phone calendar (Android): our own RallyHUB calendar.
  if (!(await ensurePermission())) return;
  const calId = await ensureRallyCalendar();
  const added = await insertInto(calId, events);
  done(`${added} ${added === 1 ? noun : `${noun}s`} added to your “${RALLY_CALENDAR_TITLE}” calendar.`, events.length - added, events);
}

// ---- Native helpers ----

async function ensurePermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Calendar access needed', 'Allow RallyHUB to use your calendar in Settings → RallyHUB → Calendars.');
    return false;
  }
  return true;
}

const deviceCalendars = async () =>
  (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)) as unknown as DeviceCalendar[];

/** Find or create the "RallyHUB" calendar in iCloud / On My iPhone — never a shared or subscribed one. */
async function ensureRallyCalendar(): Promise<string> {
  const existing = findRallyCalendar(await deviceCalendars());
  if (existing) return existing.id;

  if (Platform.OS === 'android') {
    return Calendar.createCalendarAsync({
      title: RALLY_CALENDAR_TITLE, color: '#3B82B0', entityType: Calendar.EntityTypes.EVENT,
      source: { isLocalAccount: true, name: RALLY_CALENDAR_TITLE, type: Calendar.SourceType.LOCAL as any },
      name: RALLY_CALENDAR_TITLE, ownerAccount: 'personal', accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }
  const def = (await Calendar.getDefaultCalendarAsync().catch(() => null)) as unknown as DeviceCalendar | null;
  const sources = (await Calendar.getSourcesAsync()) as any[];
  const src = pickSourceForNewCalendar(sources, def) as any;
  if (!src?.id) throw new Error('No calendar account on this phone accepts new calendars. Turn on iCloud Calendars in Settings, or choose Google.');
  return Calendar.createCalendarAsync({
    title: RALLY_CALENDAR_TITLE, color: '#3B82B0', entityType: Calendar.EntityTypes.EVENT,
    sourceId: src.id, source: src, name: RALLY_CALENDAR_TITLE, ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

/** Insert, skipping events already there (same title + start). Returns how many were added. */
async function insertInto(calendarId: string, events: CalEvent[]): Promise<number> {
  const starts = events.map((e) => (e.allDay ? localDate(e.startDate) : new Date(e.start)));
  const from = new Date(Math.min(...starts.map((d) => d.getTime())) - 86_400_000);
  const to = new Date(Math.max(...starts.map((d) => d.getTime())) + 2 * 86_400_000);
  const existing = await Calendar.getEventsAsync([calendarId], from, to).catch(() => []);
  const fresh = withoutDuplicates(events, existing as any);
  for (const e of fresh) {
    await Calendar.createEventAsync(calendarId, e.allDay
      ? { title: e.title, startDate: localDate(e.startDate), endDate: localDate(e.endDate), allDay: true, location: e.location ?? undefined, notes: e.notes ?? undefined }
      : { title: e.title, startDate: new Date(e.start), endDate: new Date(e.end), allDay: false, location: e.location ?? undefined, notes: e.notes ?? undefined });
  }
  return fresh.length;
}

function done(message: string, skipped: number, events?: CalEvent[]) {
  const extra = skipped > 0 ? ` ${skipped} already ${skipped === 1 ? 'was' : 'were'} there.` : '';
  const first = events?.[0];
  const buttons: any[] = [{ text: 'OK' }];
  if (Platform.OS === 'ios' && first) {
    // calshow: takes seconds since 2001-01-01.
    const t = (first.allDay ? localDate(first.startDate) : new Date(first.start)).getTime() / 1000 - 978_307_200;
    buttons.push({ text: 'Open Calendar', onPress: () => Linking.openURL(`calshow:${Math.round(t)}`) });
  }
  Alert.alert('Added to your calendar', message + extra, buttons);
}

function fail(title: string, message?: string) {
  if (Platform.OS === 'web') showCalendarNotice({ title, body: message ?? 'Please try again.' });
  else Alert.alert(title, message ?? 'Please try again.');
}

// ---- Web ----

function downloadIcs(events: CalEvent[]) {
  const url = URL.createObjectURL(new Blob([buildIcs(events)], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rallyhub-calendar.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
