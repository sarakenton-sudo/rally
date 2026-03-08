import "../global.css";
import { ThemeProvider, type Theme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { DataProvider } from '@/providers/DataProvider';
import { NotificationProvider } from '@/providers/NotificationProvider';

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
    primary: '#C4714A',
    background: '#F5EFE6',
    card: '#FAF7F3',
    text: '#3D2E22',
    border: '#EDE4D6',
    notification: '#C4714A',
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
    primary: '#E4AC85',
    background: '#3D2E22',
    card: '#4A3829',
    text: '#F5EFE6',
    border: '#5E2F1E',
    notification: '#C4714A',
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

  useEffect(() => {
    if (isLoading) return;
    // Skip auth gating in dev mode when Supabase isn't configured
    if (!isSupabaseConfigured) return;

    const inAuthScreen = segments[0] === 'auth';

    if (!session && !inAuthScreen) {
      router.replace('/auth');
    } else if (session && inAuthScreen) {
      router.replace('/');
    }
  }, [session, isLoading, segments]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? RallyDarkTheme : RallyLightTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
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
      </Stack>
    </ThemeProvider>
  );
}
