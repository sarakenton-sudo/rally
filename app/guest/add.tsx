import { useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField'; // for relationship
import { useGuestStore } from '@/stores/useGuestStore';
import { useAuth } from '@/providers/AuthProvider';
import { insertGuest, updateGuest as updateGuestDB, deleteGuest as deleteGuestDB } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { Guest, NotificationPref } from '@/types/database';

const RELATIONSHIPS = ['Grandma', 'Grandpa', 'Uncle', 'Aunt', 'Friend', 'Other'];

export default function AddGuestScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const guests = useGuestStore((s) => s.guests);
  const existing = useMemo(() => editId ? guests.find((g) => g.id === editId) : null, [editId, guests]);
  const isEditing = !!existing;

  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [relationship, setRelationship] = useState(existing?.relationship ?? '');
  const [defaultInvited, setDefaultInvited] = useState(existing?.default_invited ?? false);
  const [isSaving, setIsSaving] = useState(false);

  const ic = useIconColors();
  const addGuest = useGuestStore((s) => s.addGuest);
  const updateGuestStore = useGuestStore((s) => s.updateGuest);
  const removeGuest = useGuestStore((s) => s.removeGuest);
  const { user } = useAuth();
  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing field', 'Please enter a name.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Missing field', 'Please enter a phone number for SMS notifications.');
      return;
    }
    if (!relationship) {
      Alert.alert('Missing field', 'Please select a relationship.');
      return;
    }

    setIsSaving(true);

    const guestData = {
      user_id: user?.id ?? '00000000-0000-0000-0000-000000000001',
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      relationship,
      notification_pref: 'sms' as NotificationPref,
      default_invited: defaultInvited,
    };

    try {
      if (isEditing) {
        const updates = {
          name: guestData.name,
          phone: guestData.phone,
          email: guestData.email,
          relationship: guestData.relationship,
          default_invited: guestData.default_invited,
        };
        if (isSupabaseConfigured && user) {
          const { error } = await updateGuestDB(editId!, updates);
          if (error) {
            Alert.alert('Save failed', error.message);
            return;
          }
        }
        updateGuestStore(editId!, updates);
        notifySuccess();
      } else {
        if (isSupabaseConfigured && user) {
          const { data, error } = await insertGuest(guestData);
          if (error) {
            Alert.alert('Save failed', error.message);
            return;
          }
          if (data) { addGuest(data); notifySuccess(); }
        } else {
          const guest: Guest = {
            ...guestData,
            id: `g-${Date.now()}`,
            created_at: new Date().toISOString(),
          };
          addGuest(guest);
          notifySuccess();
        }
      }
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert(
      'Delete Guest',
      `Remove "${existing.name}" from your guest list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (isSupabaseConfigured && user) {
              await deleteGuestDB(editId!);
            }
            removeGuest(editId!);
            router.back();
          },
        },
      ]
    );
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
            {isEditing ? 'Edit Guest' : 'Add Guest'}
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
          <FormField label="Name" value={name} onChangeText={setName} placeholder="e.g. Grandma Kenton" />
          <FormField label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+1 (512) 555-1001" keyboardType="phone-pad" />
          <FormField label="Email (optional)" value={email} onChangeText={setEmail} placeholder="grandma@example.com" keyboardType="email-address" autoCapitalize="none" />
          <DropdownField label="Relationship" value={relationship} options={RELATIONSHIPS} onChange={setRelationship} />

          {/* Default invited toggle */}
          <View className="flex-row items-center justify-between mb-6 bg-cream dark:bg-bark-light rounded-xl px-4 py-3">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-medium text-bark dark:text-parchment">
                Auto-Invite to All Tournaments
              </Text>
              <Text className="text-xs text-stone dark:text-stone mt-0.5">
                Automatically invite this guest to every tournament
              </Text>
            </View>
            <Switch
              value={defaultInvited}
              onValueChange={setDefaultInvited}
              trackColor={{ false: '#D8E2EC', true: '#7DBDD9' }}
              thumbColor={defaultInvited ? '#3B82B0' : '#FEFEFE'}
            />
          </View>

          {/* Info card */}
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-8">
            <View className="flex-row items-start">
              <Ionicons name="information-circle" size={18} color="#3B82B0" />
              <Text className="text-xs text-rally-700 dark:text-rally-300 ml-2 flex-1">
                Guests receive automated notifications via SMS or push — no app install required.
                They can RSVP by replying YES, NO, or MAYBE to the SMS.
              </Text>
            </View>
          </View>

          {/* Delete button (edit mode only) */}
          {isEditing && (
            <Pressable
              className="bg-red-50 dark:bg-red-900/20 rounded-xl py-4 items-center mb-8 active:opacity-80"
              onPress={handleDelete}
            >
              <View className="flex-row items-center">
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
                <Text className="text-sm font-semibold text-red-600 dark:text-red-400 ml-2">
                  Delete Guest
                </Text>
              </View>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
