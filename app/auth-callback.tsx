import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Handles Supabase magic link callbacks on web.
 * The Supabase client auto-detects the session from the URL hash
 * (detectSessionInUrl: true), so we just wait for it and redirect.
 */
export default function AuthCallbackScreen() {
  useEffect(() => {
    if (!isSupabaseConfigured) {
      router.replace('/');
      return;
    }

    // Give Supabase a moment to detect the session from the URL hash
    const checkSession = async () => {
      // Wait briefly for detectSessionInUrl to process
      await new Promise((r) => setTimeout(r, 1000));

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/');
      } else {
        // Retry once more after a longer delay
        await new Promise((r) => setTimeout(r, 2000));
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        router.replace(retrySession ? '/' : '/auth');
      }
    };

    checkSession();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F0EB' }}>
      <ActivityIndicator size="large" color="#3B82B0" />
      <Text style={{ marginTop: 16, fontSize: 15, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F' }}>
        Signing you in...
      </Text>
    </View>
  );
}
