import { Alert, Linking, Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

/** 'YYYY-MM-DD' → local midnight (not UTC, which shifts the day in US timezones). */
const localDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Add an all-day, possibly multi-day event (e.g. a tournament) to the user's calendar.
 * Native: the OS "New Event" sheet, prefilled — the user reviews and taps Add.
 * (Opening a data:text/calendar URL, the old approach, silently does nothing on iOS.)
 * Web: Google Calendar's event template.
 */
export async function addAllDayEventToCalendar(e: {
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD, inclusive
  location?: string | null;
  notes?: string | null;
}) {
  if (Platform.OS === 'web') {
    // Google's all-day end date is exclusive.
    const end = localDate(e.endDate);
    end.setDate(end.getDate() + 1);
    const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: e.title,
      dates: `${e.startDate.replace(/-/g, '')}/${fmt(end)}`,
      location: e.location ?? '',
      details: e.notes ?? '',
    });
    Linking.openURL(`https://calendar.google.com/calendar/render?${params}`);
    return;
  }

  try {
    await Calendar.createEventInCalendarAsync({
      title: e.title,
      startDate: localDate(e.startDate),
      endDate: localDate(e.endDate),
      allDay: true,
      location: e.location ?? undefined,
      notes: e.notes ?? undefined,
    });
  } catch (err: any) {
    Alert.alert("Couldn't open your calendar", err?.message ?? 'Please try again.');
  }
}

/**
 * Add several all-day events at once (Season → "Add All to Calendar").
 * Native: asks calendar permission once, then writes straight into the default
 * calendar and reports how many were added. Web: downloads one .ics file.
 */
export async function addAllDayEventsToCalendar(events: {
  title: string; startDate: string; endDate: string; location?: string | null;
}[]): Promise<void> {
  if (!events.length) return;

  if (Platform.OS === 'web') {
    const vevents = events.map((e) => {
      const end = localDate(e.endDate);
      end.setDate(end.getDate() + 1); // DTEND exclusive for all-day
      const endYmd = `${end.getFullYear()}${String(end.getMonth() + 1).padStart(2, '0')}${String(end.getDate()).padStart(2, '0')}`;
      return `BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:${e.startDate.replace(/-/g, '')}\r\nDTEND;VALUE=DATE:${endYmd}\r\nSUMMARY:${e.title}\r\nLOCATION:${e.location ?? ''}\r\nEND:VEVENT`;
    }).join('\r\n');
    const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//RALLY//Season//EN\r\n${vevents}\r\nEND:VCALENDAR`;
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rally-season.ics';
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Calendar access needed', 'Allow RallyHUB to use your calendar in Settings to add tournaments.');
      return;
    }
    const cal = Platform.OS === 'ios'
      ? await Calendar.getDefaultCalendarAsync()
      : (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).find((c) => c.allowsModifications);
    if (!cal) throw new Error('No writable calendar found.');
    for (const e of events) {
      await Calendar.createEventAsync(cal.id, {
        title: e.title,
        startDate: localDate(e.startDate),
        endDate: localDate(e.endDate),
        allDay: true,
        location: e.location ?? undefined,
      });
    }
    Alert.alert('Added to your calendar', `${events.length} tournament${events.length === 1 ? '' : 's'} added to “${cal.title}”.`);
  } catch (err: any) {
    Alert.alert("Couldn't add to your calendar", err?.message ?? 'Please try again.');
  }
}
