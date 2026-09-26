import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import { useAuth } from '@/providers/AuthProvider';
import { useIconColors } from '@/lib/colors';
import { notifyError } from '@/lib/haptics';
import { pickAndUploadCoachPhoto, isSupabaseConfigured } from '@/lib/coach';
import type { Coach, CoachVisibility, CostTier, FeeHandling } from '@/types/database';
import type { CoachListingValues } from '@/lib/coach';

const VISIBILITY_OPTIONS = ['Public — discoverable', 'Private — invite only'];
const VISIBILITY_TO_VALUE: Record<string, CoachVisibility> = {
  'Public — discoverable': 'public',
  'Private — invite only': 'private',
};
const VALUE_TO_VISIBILITY: Record<CoachVisibility, string> = {
  public: 'Public — discoverable',
  private: 'Private — invite only',
};

const COST_OPTIONS = ['$ — budget', '$$ — mid', '$$$ — premium', 'Not set'];
const COST_TO_VALUE: Record<string, CostTier | null> = {
  '$ — budget': '$', '$$ — mid': '$$', '$$$ — premium': '$$$', 'Not set': null,
};
const VALUE_TO_COST: Record<string, string> = { '$': '$ — budget', '$$': '$$ — mid', '$$$': '$$$ — premium' };

const FEE_OPTIONS = ['I cover processing fees', 'Add a service fee for clients'];
const FEE_TO_VALUE: Record<string, FeeHandling> = {
  'I cover processing fees': 'absorb',
  'Add a service fee for clients': 'surcharge',
};
const VALUE_TO_FEE: Record<FeeHandling, string> = {
  absorb: 'I cover processing fees',
  surcharge: 'Add a service fee for clients',
};

interface Props {
  title: string;
  submitLabel: string;
  existing?: Coach | null;
  onSubmit: (values: CoachListingValues) => Promise<void>;
}

export default function CoachListingForm({ title, submitLabel, existing, onSubmit }: Props) {
  const ic = useIconColors();
  const { user } = useAuth();

  const [photoUrl, setPhotoUrl] = useState<string | null>(existing?.photo_url ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [displayName, setDisplayName] = useState(existing?.display_name ?? '');
  const [bio, setBio] = useState(existing?.bio ?? '');
  const [specialties, setSpecialties] = useState((existing?.specialties ?? []).join(', '));
  const [visibility, setVisibility] = useState<CoachVisibility>(existing?.visibility ?? 'private');
  const [costTier, setCostTier] = useState<CostTier | null>(existing?.cost_tier ?? null);
  const [feeHandling, setFeeHandling] = useState<FeeHandling>(existing?.fee_handling ?? 'absorb');
  const [isSaving, setIsSaving] = useState(false);

  const showAlert = (t: string, m: string) => {
    if (Platform.OS === 'web') window.alert(`${t}: ${m}`);
    else Alert.alert(t, m);
  };

  const handlePickPhoto = async () => {
    if (!isSupabaseConfigured || !user) {
      showAlert('Not available', 'Sign in to upload a photo.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await pickAndUploadCoachPhoto(user.id);
      if (url) setPhotoUrl(url);
    } catch (e) {
      notifyError();
      showAlert('Upload failed', (e as Error).message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!displayName.trim()) { showAlert('Missing field', 'Please enter your name.'); notifyError(); return; }
    setIsSaving(true);
    try {
      await onSubmit({
        display_name: displayName.trim(),
        photo_url: photoUrl,
        bio: bio.trim() || null,
        specialties: specialties.split(',').map((s) => s.trim()).filter(Boolean),
        sport: existing?.sport ?? 'volleyball',
        visibility,
        cost_tier: costTier,
        fee_handling: feeHandling,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">{title}</Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            className={`px-4 py-1.5 rounded-lg ${isSaving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-cream">{isSaving ? 'Saving...' : submitLabel}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          {/* Photo picker */}
          <View className="items-center mb-5">
            <Pressable onPress={handlePickPhoto} className="active:opacity-80">
              <View className="w-24 h-24 rounded-full bg-cream dark:bg-bark-light border border-parchment dark:border-rally-900 items-center justify-center overflow-hidden">
                {uploadingPhoto ? (
                  <ActivityIndicator color="#3B82B0" />
                ) : photoUrl ? (
                  <Image source={{ uri: photoUrl }} className="w-24 h-24" resizeMode="cover" />
                ) : (
                  <Ionicons name="camera" size={26} color={ic.placeholder} />
                )}
              </View>
              <View className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-rally-600 items-center justify-center border-2 border-warm-white dark:border-bark">
                <Ionicons name={photoUrl ? 'pencil' : 'add'} size={14} color="#fff" />
              </View>
            </Pressable>
            <Text className="text-xs text-stone dark:text-parchment mt-2">
              {photoUrl ? 'Tap to change photo' : 'Add a profile photo'}
            </Text>
          </View>

          <FormField label="Your Name" value={displayName} onChangeText={setDisplayName} placeholder="e.g. Coach Alex Rivera" />
          <FormField
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Former college libero. I focus on defense & serve-receive for advanced players."
            multiline
            numberOfLines={4}
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
          <FormField
            label="Specialties (comma separated)"
            value={specialties}
            onChangeText={setSpecialties}
            placeholder="setting, defense, recruiting"
          />

          <DropdownField
            label="Listing Visibility"
            value={VALUE_TO_VISIBILITY[visibility]}
            options={VISIBILITY_OPTIONS}
            onChange={(v) => setVisibility(VISIBILITY_TO_VALUE[v])}
          />
          {visibility === 'public' && (
            <View className="bg-rally-50 dark:bg-rally-900/20 rounded-lg px-3 py-2 mb-4 -mt-2 flex-row items-start">
              <Ionicons name="information-circle" size={15} color="#3B82B0" style={{ marginTop: 1 }} />
              <Text className="text-xs text-rally-600 ml-1.5 flex-1">
                Public listings require verified identity + SafeSport before they go live. You can set everything up now.
              </Text>
            </View>
          )}

          <DropdownField
            label="Cost Level (shown on your listing)"
            value={costTier ? VALUE_TO_COST[costTier] : 'Not set'}
            options={COST_OPTIONS}
            onChange={(v) => setCostTier(COST_TO_VALUE[v])}
          />

          <DropdownField
            label="Processing Fees"
            value={VALUE_TO_FEE[feeHandling]}
            options={FEE_OPTIONS}
            onChange={(v) => setFeeHandling(FEE_TO_VALUE[v])}
          />

          <View className="bg-cream dark:bg-bark-light rounded-xl px-3 py-2.5 mb-4 flex-row items-start">
            <Ionicons name="business" size={15} color={ic.muted} style={{ marginTop: 1 }} />
            <Text className="text-xs text-stone dark:text-parchment ml-2 flex-1">
              Add the gyms you coach at under <Text className="font-semibold">Facilities</Text> on your coaching dashboard — you can set different availability per location.
            </Text>
          </View>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
