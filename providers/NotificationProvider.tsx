import { useEffect, useRef, createContext, useContext, useState, type ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuth } from './AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

    // Listen for incoming notifications (foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 50));
    });

    // Listen for notification taps (opens app)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      // Navigate based on notification type
      if (data?.tournamentId) {
        router.push(`/tournament/${data.tournamentId}`);
      }
    });

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

/** Store the Expo push token in a user metadata field or dedicated table */
async function savePushToken(userId: string, token: string) {
  try {
    // Store in app_sessions table (from admin migration)
    await supabase.from('app_sessions' as any).upsert({
      user_id: userId,
      push_token: token,
      platform: Platform.OS,
      last_active: new Date().toISOString(),
    } as any);
  } catch (err) {
    console.warn('Failed to save push token:', err);
  }
}
