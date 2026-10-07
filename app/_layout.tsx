import "../global.css";
import { ThemeProvider, type Theme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router, useSegments } from 'expo-router';
import { Platform } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { DataProvider } from '@/providers/DataProvider';
import { NotificationProvider } from '@/providers/NotificationProvider';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { takeNextPath, rememberNextPath } from '@/lib/bookingPage';
import { ToastHost } from '@/components/Toast';
import { CalendarChooserHost } from '@/components/CalendarChooser';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    'Nunito-ExtraBold': require('../assets/fonts/Nunito-ExtraBold.ttf'),
    'Nunito-Black': require('../assets/fonts/Nunito-Black.ttf'),
    'NunitoSans-Regular': require('../assets/fonts/NunitoSans-Regular.ttf'),
    'NunitoSans-SemiBold': require('../assets/fonts/NunitoSans-SemiBold.ttf'),
    'NunitoSans-Bold': require('../assets/fonts/NunitoSans-Bold.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      // Web: remove the instant loading screen from +html.tsx.
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.getElementById('rally-boot')?.remove();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AuthProvider>
      <DataProvider>
        <NotificationProvider>
          <RootLayoutNav />
        </NotificationProvider>
      </DataProvider>
    </AuthProvider>
  );
}

// Dev mode: skip auth if Supabase not configured
const isSupabaseConfigured = !!(
  process.env.EXPO_PUBLIC_SUPABASE_URL &&
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

const RallyLightTheme: Theme = {
  dark: false,
  colors: {
    primary: '#3B82B0',
    background: '#F4F6F8',
    card: '#FEFEFE',
    text: '#1E3A5F',
    border: '#D8E2EC',
    notification: '#3B82B0',
  },
  fonts: {
    regular: { fontFamily: 'NunitoSans-Regular', fontWeight: '400' as const },
    medium: { fontFamily: 'NunitoSans-SemiBold', fontWeight: '600' as const },
    bold: { fontFamily: 'NunitoSans-Bold', fontWeight: '700' as const },
    heavy: { fontFamily: 'Nunito-ExtraBold', fontWeight: '800' as const },
  },
};

const RallyDarkTheme: Theme = {
  dark: true,
  colors: {
    primary: '#7DBDD9',
    background: '#1E3A5F',
    card: '#264B73',
    text: '#F4F6F8',
    border: '#152F43',
    notification: '#3B82B0',
  },
  fonts: {
    regular: { fontFamily: 'NunitoSans-Regular', fontWeight: '400' as const },
    medium: { fontFamily: 'NunitoSans-SemiBold', fontWeight: '600' as const },
    bold: { fontFamily: 'NunitoSans-Bold', fontWeight: '700' as const },
    heavy: { fontFamily: 'Nunito-ExtraBold', fontWeight: '800' as const },
  },
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, userProfile, isLoading } = useAuth();
  const segments = useSegments();
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const adminAthletes = useSeasonStore((s) => s.adminAthletes);
  const storeLoading = useSeasonStore((s) => s.isLoading);

  // Co-parent detection: admin with linked athletes but no own config
  const isCoParent = userProfile?.role === 'admin' && !adminConfig && adminAthletes.length > 0;
  // Coach accounts live in the /coach section (the dashboard handles listing setup)
  const isCoach = userProfile?.account_type === 'coach';

  // Guard against re-issuing the same redirect before navigation settles (which
  // races the heavy (tabs) screen mount and causes a "max update depth" loop).
  const lastTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || storeLoading) return;
    if (!isSupabaseConfigured) return;

    const inAuthFlow = segments[0] === 'auth' || segments[0] === 'landing';
    const inOnboarding = segments[0] === 'onboarding';
    // Public coach booking pages work logged out.
    const inPublic = segments[0] === 'book' || segments[0] === 'fan';   // fan invite page works signed out
    const isFan = (userProfile?.role as string) === 'fan';
    // Lesson-first parents (arrived via a coach's page) can book without the
    // team/season onboarding.
    const inLessonFlow = inPublic || segments[0] === 'coaching' || segments[0] === 'documents';

    let target: string | null = null;
    // Just signed in/up from a booking page → back to it.
    const next = session && inAuthFlow ? takeNextPath() : null;
    if (next) {
      target = next;
    } else if (!session) {
      if (!inAuthFlow && !inPublic) {
        // e.g. an emailed /coaching/sign?coachId…&athleteId… link: return there after sign-in.
        if (segments[0] === 'coaching' && Platform.OS === 'web' && typeof window !== 'undefined') {
          rememberNextPath(window.location.pathname + window.location.search);
        }
        target = '/auth';
      }
    } else if (isCoach) {
      // Coach account — lives in /coach. Only pull them off the "wrong home"
      // screens (auth/onboarding/tabs), never out of legit stack routes (settings).
      if (inAuthFlow || inOnboarding || segments[0] === '(tabs)') target = '/today';
    } else if (isFan) {
      // Fan: read-only family view (tournaments and games).
      if (inAuthFlow || inOnboarding || segments[0] === '(tabs)' || segments[0] === '(coach)') target = '/fan-home';
    } else if (isCoParent) {
      if (inAuthFlow || inOnboarding) target = '/(tabs)';
    } else if (userProfile?.role === 'admin' && !adminConfig && !isCoParent) {
      if (!inOnboarding && !inLessonFlow) target = '/onboarding';
    } else if (userProfile?.role === 'admin' && adminConfig && !activeSeasonId) {
      if (!inOnboarding && !inLessonFlow) target = '/onboarding';
    } else if (userProfile?.role === 'athlete') {
      if (inAuthFlow || inOnboarding) target = '/(tabs)';
    } else if (adminConfig && activeSeasonId) {
      if (inAuthFlow || inOnboarding) target = '/(tabs)';
    }

    if (!target) { lastTargetRef.current = null; return; }
    if (lastTargetRef.current === target) return; // already issued — don't loop
    lastTargetRef.current = target;
    // Close any open modal first: otherwise iOS replaces *inside* it and the
    // new screen (e.g. login after Sign Out in the Account sheet) appears as a
    // card on top of the app.
    try { if (router.canDismiss()) router.dismissAll(); } catch { /* nothing open */ }
    router.replace(target as Parameters<typeof router.replace>[0]);
  }, [session, isLoading, segments, adminConfig, activeSeasonId, storeLoading, userProfile, adminAthletes, isCoach, isCoParent]);

  const theme = colorScheme === 'dark' ? RallyDarkTheme : RallyLightTheme;

  // Block rendering until auth is validated (no stale session flash)
  if (isLoading) {
    return (
      <ThemeProvider value={theme}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background }} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={theme}>
      {/* Every screen draws its own header + back button; the default stack header
          showed a second "< (tabs)" bar on screens not listed here (and on
          folders with their own _layout, like athlete/). */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(coach)" options={{ headerShown: false }} />
        <Stack.Screen name="landing" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false, presentation: 'card', gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen
          name="booking/add-hotel"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="booking/add-flight"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="booking/hotel-detail"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/flight-detail"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="booking/add-team-event"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="tournament/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="athlete/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="import/paste"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="import/review"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="profile/add-usav"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="profile/edit-link"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="notifications"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="email/inbox"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="email/detail"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="tournament/add"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="tournament/add-stream"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="tournament/edit"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/email-monitoring"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/notifications"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/streaming-hub"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/travel-sync"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/schedule-import"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/team-details"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/leagueapps-connect"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="import/paste-combined"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="import/paste-travel"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="import/review-travel"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="import/paste-tournament-details"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="import/review-tournament-details"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="settings/account"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/payments"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/change-password"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/invite-coparent"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/email-forward"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/trusted-emails"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/add-season"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/add-athlete"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="settings/edit-athlete"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="coach/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/schedule"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/clients"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/policies"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/payments"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="book/[slug]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/booking-page"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="documents/[id]"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="coach/client"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/onboarding"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="coach/listing-edit"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="coach/facilities"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/session-types"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/session-type-edit"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="coach/availability"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/availability-add"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="coach/slot-edit"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="coach/segments"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/requests"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coaching/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coaching/[coachId]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coach/book-family"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="coach/announce"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="coach/unpaid"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="lessons/index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coaching/availability"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="coaching/book"
          options={{ presentation: 'modal', headerShown: false }}
        />
      </Stack>
      <ToastHost />
      <CalendarChooserHost />
    </ThemeProvider>
  );
}
