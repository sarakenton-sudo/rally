import { useEffect, useRef, createContext, useContext, useState, type ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuth } from './AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { acceptRequest, declineRequest, respondToReschedule, coachRespondToReschedule } from '@/lib/coach';

// Configure how notifications appear when app is in foreground
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  // Coach lesson requests: long-press (iOS) / expand (Android) shows these buttons.
  // Both open the app so the action runs with the coach's signed-in session.
  Notifications.setNotificationCategoryAsync('booking_request', [
    { identifier: 'approve', buttonTitle: 'Approve', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
    { identifier: 'decline', buttonTitle: 'Decline', options: { opensAppToForeground: true, isAuthenticationRequired: true, isDestructive: true } },
  ]).catch(() => {});

  // A family asked to move a lesson: the coach answers from the push (00082).
  Notifications.setNotificationCategoryAsync('family_reschedule_request', [
    { identifier: 'accept', buttonTitle: 'Accept new time', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
    { identifier: 'keep', buttonTitle: 'Keep original', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
  ]).catch(() => {});

  // Coach asked to move a lesson: the family answers from the push.
  Notifications.setNotificationCategoryAsync('reschedule_proposal', [
    { identifier: 'accept', buttonTitle: 'Accept new time', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
    { identifier: 'keep', buttonTitle: 'Keep original', options: { opensAppToForeground: true, isAuthenticationRequired: true } },
  ]).catch(() => {});
}

/** Coach: Accept / Keep original on a family's move request, else open Today. */
async function handleFamilyRescheduleResponse(response: Notifications.NotificationResponse) {
  const bookingId = response.notification.request.content.data?.bookingId as string | undefined;
  const action = response.actionIdentifier;
  router.push('/today');
  if (!bookingId || (action !== 'accept' && action !== 'keep')) return; // plain tap: answer on Today
  const { error } = await coachRespondToReschedule(bookingId, action === 'accept');
  if (error) Alert.alert("Couldn't update the lesson", error.message);
  else Alert.alert(action === 'accept' ? 'Lesson moved' : 'Original time kept', 'The family has been told.');
}

/** Accept / Keep original straight from a "move this lesson?" push, else open Home. */
async function handleRescheduleResponse(response: Notifications.NotificationResponse) {
  const bookingId = response.notification.request.content.data?.bookingId as string | undefined;
  const action = response.actionIdentifier;
  router.push('/(tabs)');
  if (!bookingId || (action !== 'accept' && action !== 'keep')) return; // plain tap: answer on Home
  const { error } = await respondToReschedule(bookingId, action === 'accept');
  if (error) Alert.alert("Couldn't update the lesson", error.message);
  else Alert.alert(action === 'accept' ? 'Lesson moved' : 'Original time kept', 'Your coach has been told.');
}

/** Approve/Decline straight from a lesson-request push, else open Requests. */
async function handleBookingRequestResponse(response: Notifications.NotificationResponse) {
  const requestId = response.notification.request.content.data?.requestId as string | undefined;
  const action = response.actionIdentifier;
  if (!requestId || (action !== 'approve' && action !== 'decline')) {
    router.push('/coach/requests');
    return;
  }
  const { error } = action === 'approve' ? await acceptRequest(requestId) : await declineRequest(requestId);
  if (error) {
    Alert.alert("Couldn't update request", error.message);
    router.push('/coach/requests');
  } else {
    Alert.alert(action === 'approve' ? 'Lesson approved' : 'Request declined',
      action === 'approve' ? "It's on your schedule." : 'The family has been notified.');
    router.push(action === 'approve' ? '/coach/schedule' : '/coach/requests');
  }
}

interface NotificationContextValue {
  expoPushToken: string | null;
  notifications: Notifications.Notification[];
  sendLocalNotification: (title: string, body: string, data?: Record<string, unknown>) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  expoPushToken: null,
  notifications: [],
  sendLocalNotification: async () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Push notifications don't work on web
  if (Platform.OS === 'web') {
    return null;
  }

  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // Get the Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  // Android notification channel
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  return tokenData.data;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notifications.Notification[]>([]);
  const notificationListener = useRef<Notifications.EventSubscription>(null);
  const responseListener = useRef<Notifications.EventSubscription>(null);
  const handledResponses = useRef(new Set<string>());
  const { user } = useAuth();

  // Register for push and store token
  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        setExpoPushToken(token);
        // Store token in Supabase for server-side push
        if (isSupabaseConfigured && user) {
          savePushToken(user.id, token);
        }
      }
    });

    if (Platform.OS !== 'web') {
      // Listen for incoming notifications (foreground)
      notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
        setNotifications((prev) => [notification, ...prev].slice(0, 50));
      });

      // Listen for notification taps (opens app)
      const onResponse = (response: Notifications.NotificationResponse) => {
        // Same response can arrive via listener and getLastNotificationResponseAsync.
        const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
        if (handledResponses.current.has(key)) return;
        handledResponses.current.add(key);

        const data = response.notification.request.content.data;
        if (data?.type === 'booking_request') {
          if (user) handleBookingRequestResponse(response);
          else handledResponses.current.delete(key); // retry once signed in
        } else if (data?.type === 'booking_confirmed') {
          router.push('/coach/schedule');
        } else if (data?.type === 'reschedule_proposed') {
          if (user) handleRescheduleResponse(response);
          else handledResponses.current.delete(key); // retry once signed in
        } else if (data?.type === 'family_reschedule_proposed') {
          if (user) handleFamilyRescheduleResponse(response);
          else handledResponses.current.delete(key); // retry once signed in
        } else if (data?.type === 'family_lesson_cancelled') {
          router.push('/coach-schedule');
        } else if (data?.type === 'reschedule_answered') {
          router.push('/coach-schedule');
        } else if (data?.type === 'lesson_changed') {
          router.push('/coaching');
        } else if (data?.type === 'lesson_reminder') {
          router.push('/(tabs)');
        } else if (data?.type === 'coach_lesson_reminder' || data?.type === 'coach_daily_summary') {
          router.push('/today');
        } else if (data?.type === 'unpaid_lessons') {
          router.push('/coach/unpaid');
        } else if (data?.type === 'coach_announcement' && data?.coachId) {
          router.push({ pathname: '/coaching/[coachId]', params: { coachId: String(data.coachId) } });
        } else if (data?.tournamentId) {
          router.push(`/tournament/${data.tournamentId}`);
        }
      };
      responseListener.current = Notifications.addNotificationResponseReceivedListener(onResponse);
      // App cold-started from a notification tap/action.
      Notifications.getLastNotificationResponseAsync().then((r) => { if (r) onResponse(r); });
    }

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [user]);

  const sendLocalNotification = async (
    title: string,
    body: string,
    data?: Record<string, unknown>
  ) => {
    if (Platform.OS === 'web') return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data },
      trigger: null, // Immediate
    });
  };

  return (
    <NotificationContext.Provider value={{ expoPushToken, notifications, sendLocalNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}

/** Store the Expo push token for server-side push (push_tokens, 00065). */
async function savePushToken(_userId: string, token: string) {
  const { error } = await (supabase.rpc as any)('register_push_token', { p_token: token, p_platform: Platform.OS });
  if (error) console.warn('Failed to save push token:', error.message);
}
