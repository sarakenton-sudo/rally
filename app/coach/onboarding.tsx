import { Platform } from 'react-native';
import { router } from 'expo-router';
import CoachListingForm from '@/components/CoachListingForm';
import { useAuth } from '@/providers/AuthProvider';
import { useCoachStore } from '@/stores/useCoachStore';
import { createCoach, isSupabaseConfigured, slugify, type CoachListingValues } from '@/lib/coach';
import { notifySuccess } from '@/lib/haptics';
import type { Coach } from '@/types/database';

export default function CoachOnboardingScreen() {
  const { user } = useAuth();
  const setCoachProfile = useCoachStore((s) => s.setCoachProfile);

  const handleSubmit = async (values: CoachListingValues) => {
    if (isSupabaseConfigured && user) {
      const { data, error } = await createCoach(user.id, values);
      if (error) {
        if (Platform.OS === 'web') window.alert(`Couldn't create listing: ${error.message}`);
        else alert(`Couldn't create listing: ${error.message}`);
        return;
      }
      if (data) setCoachProfile(data);
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
    }
    notifySuccess();
    router.replace('/coach');
  };

  return (
    <CoachListingForm
      title="Set Up Coaching"
      submitLabel="Create"
      onSubmit={handleSubmit}
    />
  );
}
