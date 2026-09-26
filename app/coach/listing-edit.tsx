import { Platform } from 'react-native';
import { router } from 'expo-router';
import CoachListingForm from '@/components/CoachListingForm';
import { useCoachStore } from '@/stores/useCoachStore';
import { updateCoach, isSupabaseConfigured, type CoachListingValues } from '@/lib/coach';
import { notifySuccess } from '@/lib/haptics';

export default function CoachListingEditScreen() {
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const updateCoachProfile = useCoachStore((s) => s.updateCoachProfile);

  const handleSubmit = async (values: CoachListingValues) => {
    if (!coachProfile) { router.back(); return; }

    if (isSupabaseConfigured) {
      const { error } = await updateCoach(coachProfile.id, values);
      if (error) {
        if (Platform.OS === 'web') window.alert(`Couldn't save: ${error.message}`);
        else alert(`Couldn't save: ${error.message}`);
        return;
      }
    }
    updateCoachProfile(values);
    notifySuccess();
    router.back();
  };

  return (
    <CoachListingForm
      title="Edit Listing"
      submitLabel="Save"
      existing={coachProfile}
      onSubmit={handleSubmit}
    />
  );
}
