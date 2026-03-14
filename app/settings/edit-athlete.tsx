import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { updateAthlete } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import { useDataRefresh } from '@/providers/DataProvider';

export default function EditAthleteScreen() {
  const ic = useIconColors();
  const { athleteId } = useLocalSearchParams<{ athleteId: string }>();
  const athletes = useSeasonStore((s) => s.athletes);
  const athlete = athletes.find((a) => a.id === athleteId);
  const { refresh } = useDataRefresh();

  const [firstName, setFirstName] = useState(athlete?.first_name ?? '');
  const [lastName, setLastName] = useState(athlete?.last_name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showError = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      setError(message);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!firstName.trim()) {
      showError('Missing field', 'First name is required.');
      return;
    }
    if (!athleteId) return;

    setSaving(true);
    try {
      const { error: err } = await updateAthlete(athleteId, {
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
      });
      if (err) throw err;
      notifySuccess();
      await refresh();
      router.back();
    } catch (err: any) {
      showError('Error', err.message ?? 'Failed to update athlete');
    } finally {
      setSaving(false);
    }
  };

  if (!athlete) {
    return (
      <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark items-center justify-center" edges={['bottom']}>
        <Text className="text-base text-stone">Athlete not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">Edit Athlete</Text>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            className={`px-4 py-1.5 rounded-lg ${saving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FEFEFE" />
            ) : (
              <Text className="text-sm font-semibold text-cream">Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          <FormField label="First Name" value={firstName} onChangeText={setFirstName} placeholder="e.g. Emma" />
          <FormField label="Last Name (optional)" value={lastName} onChangeText={setLastName} placeholder="" />

          {error && (
            <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mt-4 flex-row items-start">
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text className="text-sm text-red-700 dark:text-red-300 ml-2 flex-1">{error}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
