import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { updateAthlete, updateAdminConfig } from '@/hooks/useSupabaseData';
import { supabase } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import { useDataRefresh } from '@/providers/DataProvider';

export default function EditAthleteScreen() {
  const ic = useIconColors();
  const { athleteId } = useLocalSearchParams<{ athleteId: string }>();
  const athletes = useSeasonStore((s) => s.athletes);
  const athlete = athletes.find((a) => a.id === athleteId);
  const { refresh } = useDataRefresh();

  const AVATAR_COLORS = [
    '#3B82B0', '#7c3aed', '#6A9E8A', '#d97706', '#dc2626',
    '#0d9488', '#be185d', '#4f46e5', '#ca8a04', '#0891b2',
  ];

  const [firstName, setFirstName] = useState(athlete?.first_name ?? '');
  const [lastName, setLastName] = useState(athlete?.last_name ?? '');
  const [avatarColor, setAvatarColor] = useState(athlete?.avatar_color ?? AVATAR_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);

  const handleDelete = async () => {
    if (!athleteId) return;
    setDeleting(true);
    setError(null);
    const { error: err } = await (supabase.rpc as any)('delete_athlete', { p_athlete_id: athleteId });
    if (err) {
      setDeleting(false);
      setConfirmDelete(false);
      setError(err.message);
      return;
    }
    // Their saved logins live in the family's config.
    if (adminConfig) {
      const kept = (adminConfig.external_links ?? []).filter((l) => l.athlete_id !== athleteId);
      if (kept.length !== (adminConfig.external_links ?? []).length) {
        await updateAdminConfig(adminConfig.id, { external_links: kept });
        setAdminConfig({ ...adminConfig, external_links: kept });
      }
    }
    notifySuccess();
    await refresh();
    setDeleting(false);
    try { if (router.canDismiss()) router.dismissAll(); } catch { /* nothing open */ }
    router.replace('/family');
  };

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
        avatar_color: avatarColor,
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
          {/* Avatar Preview + Color Picker */}
          <View className="items-center mb-6">
            <View
              className="w-20 h-20 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: avatarColor }}
            >
              <Text style={{ fontSize: 32, fontWeight: '700', color: '#FEFEFE' }}>
                {firstName ? firstName.charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
            <Text className="text-xs text-stone uppercase tracking-wider mb-2">Pick a Color</Text>
            <View className="flex-row flex-wrap justify-center gap-3">
              {AVATAR_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => setAvatarColor(color)}
                  className="items-center justify-center"
                  style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: color,
                    borderWidth: avatarColor === color ? 3 : 0,
                    borderColor: '#1E3A5F',
                  }}
                >
                  {avatarColor === color && (
                    <Ionicons name="checkmark" size={18} color="#FEFEFE" />
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          <FormField label="First Name" value={firstName} onChangeText={setFirstName} placeholder="e.g. Emma" />
          <FormField label="Last Name (optional)" value={lastName} onChangeText={setLastName} placeholder="" />

          {error && (
            <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mt-4 flex-row items-start">
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text className="text-sm text-red-700 dark:text-red-300 ml-2 flex-1">{error}</Text>
            </View>
          )}

          {/* Delete — an in-screen confirm (system alerts with buttons do nothing on web) */}
          {!confirmDelete ? (
            <Pressable
              onPress={() => { setError(null); setConfirmDelete(true); }}
              className="flex-row items-center justify-center rounded-xl py-3.5 mt-8 mb-10 bg-red-50 dark:bg-red-900/20 active:opacity-80"
              accessibilityLabel={`Delete ${athlete.first_name}`}
            >
              <Ionicons name="trash-outline" size={16} color="#dc2626" />
              <Text className="text-sm font-semibold text-red-600 ml-2">Delete athlete</Text>
            </Pressable>
          ) : (
            <View className="rounded-xl p-4 mt-8 mb-10 border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20">
              <Text className="text-sm font-bold text-red-700 dark:text-red-300">Delete {athlete.first_name}?</Text>
              <Text className="text-xs text-red-700/90 dark:text-red-300 mt-1.5 leading-5">
                This removes {athlete.first_name} for everyone in your family: their teams, tournaments, hotels,
                flights and tickets, their saved logins and any pending invites. It can't be undone.
                Coaches keep records of past lessons.
              </Text>
              <View className="flex-row mt-3" style={{ gap: 8 }}>
                <Pressable
                  onPress={handleDelete}
                  disabled={deleting}
                  className="rounded-lg px-4 py-2 bg-red-600 active:opacity-80"
                  accessibilityLabel={`Yes, delete ${athlete.first_name}`}
                >
                  <Text className="text-xs font-bold text-white">{deleting ? 'Deleting…' : `Delete ${athlete.first_name}`}</Text>
                </Pressable>
                <Pressable onPress={() => setConfirmDelete(false)} className="rounded-lg px-4 py-2 border border-parchment dark:border-rally-900">
                  <Text className="text-xs font-bold text-bark dark:text-cream">Keep</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
