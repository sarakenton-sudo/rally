import { useState } from 'react';
import { Platform, View, Text, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from '@/components/SafeAreaView';
import FormField from '@/components/FormField';
import CoachListingForm from '@/components/CoachListingForm';
import { CORAL, CORAL_TINT } from '@/lib/colors';
import { useAuth } from '@/providers/AuthProvider';
import { useCoachStore } from '@/stores/useCoachStore';
import { createCoach, createFacility, isSupabaseConfigured, slugify, type CoachListingValues } from '@/lib/coach';
import { notifySuccess } from '@/lib/haptics';
import type { Coach } from '@/types/database';

export default function CoachOnboardingScreen() {
  const { user } = useAuth();
  const setCoachProfile = useCoachStore((s) => s.setCoachProfile);
  // Step 2: where they coach. Every block of availability needs a location.
  const [coach, setCoach] = useState<Coach | null>(null);

  const handleSubmit = async (values: CoachListingValues) => {
    if (isSupabaseConfigured && user) {
      const { data, error } = await createCoach(user.id, values);
      if (error) {
        if (Platform.OS === 'web') window.alert(`Couldn't create listing: ${error.message}`);
        else alert(`Couldn't create listing: ${error.message}`);
        return;
      }
      if (data) { setCoachProfile(data); setCoach(data); }
    } else {
      // Mock fallback (no Supabase configured in dev)
      const now = new Date().toISOString();
      const mock: Coach = {
        id: `coach-${Date.now()}`,
        user_id: user?.id ?? 'mock-user',
        certifications: [],
        safesport_status: null,
        identity_verified: false,
        default_timezone: 'America/Chicago',
        invite_code: values.visibility === 'private' ? 'MOCKCODE' : null,
        instant_book_default: false,
        cancellation_policy_version: 'v1-standard',
        slug: slugify(values.display_name),
        stripe_account_id: null,
        onboarding_complete: false,
        created_at: now,
        updated_at: now,
        ...values,
      };
      setCoachProfile(mock);
      setCoach(mock);
    }
    notifySuccess();
  };

  if (coach) return <WhereYouCoach coachId={coach.id} />;

  return (
    <CoachListingForm
      title="Set Up Coaching"
      submitLabel="Create"
      onSubmit={handleSubmit}
    />
  );
}

/** Coach setup step 2: the first gym or facility (more can be added later). */
function WhereYouCoach({ coachId }: { coachId: string }) {
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!label.trim()) { setError('Give the gym or facility a name.'); return; }
    setBusy(true); setError(null);
    const { error: e } = await createFacility(coachId, { label: label.trim(), address: address.trim() || null, city: city.trim() || null, notes: null, contact: null }, 0);
    setBusy(false);
    if (e) { setError(e.message); return; }
    notifySuccess();
    router.replace('/today');
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text className="text-xs font-bold uppercase tracking-wider" style={{ color: CORAL }}>Step 2 of 2</Text>
          <Text className="text-2xl font-bold text-bark dark:text-cream mt-1">Where do you coach?</Text>
          <Text className="text-sm text-stone dark:text-parchment mt-1 mb-5">
            Families see this on every lesson, with directions. You can add more places later.
          </Text>
          <View className="rounded-2xl p-4 mb-4 flex-row items-start" style={{ backgroundColor: CORAL_TINT }}>
            <Ionicons name="business" size={18} color={CORAL} style={{ marginTop: 1 }} />
            <Text className="text-xs text-bark ml-2 flex-1">A club gym, a school, a park court or a beach. Use the name families know.</Text>
          </View>
          <FormField label="Gym or facility name" value={label} onChangeText={setLabel} placeholder="e.g. Austin Sports Center" />
          <FormField label="Street address (optional)" value={address} onChangeText={setAddress} placeholder="425 Woodward St" />
          <FormField label="City (optional)" value={city} onChangeText={setCity} placeholder="Austin, TX" />
          {error ? <Text className="text-sm text-red-600 mb-3">{error}</Text> : null}
          <Pressable onPress={save} disabled={busy} className="rounded-xl py-3.5 items-center active:opacity-80" style={{ backgroundColor: CORAL }} accessibilityLabel="Save and continue">
            {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-base font-bold text-white">Save and continue</Text>}
          </Pressable>
          <Pressable onPress={() => router.replace('/today')} className="py-3 items-center active:opacity-70" accessibilityLabel="Skip for now">
            <Text className="text-sm font-semibold text-stone">Skip for now</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
