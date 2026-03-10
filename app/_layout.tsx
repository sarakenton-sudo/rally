import "../global.css";
import { ThemeProvider, type Theme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { DataProvider } from '@/providers/DataProvider';
import { NotificationProvider } from '@/providers/NotificationProvider';
import { useSeasonStore } from '@/stores/useSeasonStore';

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
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const teamConfig = useSeasonStore((s) => s.teamConfig);
  const storeLoading = useSeasonStore((s) => s.isLoading);

  useEffect(() => {
    if (isLoading || storeLoading) return;
    if (!isSupabaseConfigured) return;

    const inAuthFlow = segments[0] === 'auth' || segments[0] === 'landing';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session && !inAuthFlow) {
      router.replace('/auth');
    } else if (session && !teamConfig && !inOnboarding) {
      router.replace('/onboarding');
    } else if (session && teamConfig && (inAuthFlow || inOnboarding)) {
      router.replace('/');
    }
  }, [session, isLoading, segments, teamConfig, storeLoading]);

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
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="landing" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        <Stack.Screen
          name="booking/add-hotel"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="booking/add-flight"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="tournament/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="guest/add"
          options={{ presentation: 'modal', headerShown: false }}
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
          name="import/paste-travel"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="import/review-travel"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="settings/account"
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
          name="settings/email-connect"
          options={{ presentation: 'modal', headerShown: false }}
        />
      </Stack>
    </ThemeProvider>
  );
}
