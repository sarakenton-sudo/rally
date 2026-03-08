import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DatePickerField from '@/components/DatePickerField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { insertUSAVProfile, updateUSAVProfile } from '@/hooks/useSupabaseData';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { USAVProfile } from '@/types/database';

export default function AddUSAVProfileScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const existing = useSeasonStore((s) => s.usavProfiles.find((p) => p.id === editId));

  const [memberName, setMemberName] = useState(existing?.member_name ?? '');
  const [memberId, setMemberId] = useState(existing?.member_id ?? '');
  const [clubAffiliation, setClubAffiliation] = useState(existing?.club_affiliation ?? '');
  const [expirationDate, setExpirationDate] = useState(
    existing ? new Date(existing.expiration_date) : new Date(2026, 7, 31)
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const ic = useIconColors();
  const addProfile = useSeasonStore((s) => s.addUSAVProfile);
  const updateProfile = useSeasonStore((s) => s.updateUSAVProfile);
  const { user } = useAuth();

  const handleSave = async () => {
    if (!memberName.trim()) {
      Alert.alert('Missing field', 'Please enter the member name.');
      return;
    }
    if (!memberId.trim()) {
      Alert.alert('Missing field', 'Please enter the USAV member ID.');
      return;
    }

    setIsSaving(true);

    const profileData = {
      user_id: user?.id ?? '00000000-0000-0000-0000-000000000001',
      member_name: memberName.trim(),
      member_id: memberId.trim(),
      club_affiliation: clubAffiliation.trim(),
      expiration_date: expirationDate.toISOString().split('T')[0],
      membership_card_file: existing?.membership_card_file ?? null,
      notes: notes.trim() || null,
    };

    try {
      if (editId && existing) {
        if (isSupabaseConfigured && user) {
          const { error } = await updateUSAVProfile(editId, profileData);
          if (error) {
            Alert.alert('Save failed', error.message);
            return;
          }
        }
        updateProfile(editId, profileData);
        notifySuccess();
      } else {
        if (isSupabaseConfigured && user) {
          const { data, error } = await insertUSAVProfile(profileData);
          if (error) {
            Alert.alert('Save failed', error.message);
            return;
          }
          if (data) addProfile(data);
        } else {
          const profile: USAVProfile = {
            ...profileData,
            id: `usav-${Date.now()}`,
            created_at: new Date().toISOString(),
          };
          addProfile(profile);
          notifySuccess();
        }
      }
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">
            {editId ? 'Edit' : 'Add'} USAV Profile
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            className={`px-4 py-1.5 rounded-lg ${isSaving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-cream">{isSaving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          {/* USA Volleyball branding */}
          <View className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mb-6 flex-row items-center">
            <Ionicons name="shield-checkmark" size={24} color="#dc2626" />
            <Text className="text-sm text-red-700 dark:text-red-300 ml-3 flex-1">
              Add your child's USAV membership for quick check-in at tournaments.
            </Text>
          </View>

          <FormField label="Member Name" value={memberName} onChangeText={setMemberName} placeholder="e.g. Avery Kenton" />
          <FormField label="USAV Member ID" value={memberId} onChangeText={setMemberId} placeholder="e.g. USAV-2026-1234567" autoCapitalize="characters" />
          <FormField label="Club Affiliation" value={clubAffiliation} onChangeText={setClubAffiliation} placeholder="e.g. Austin Juniors Volleyball" />
          <DatePickerField label="Membership Expiration" value={expirationDate} onChange={setExpirationDate} />
          <FormField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Any additional notes" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
