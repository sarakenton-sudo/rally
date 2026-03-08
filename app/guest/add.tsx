import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import DropdownField from '@/components/DropdownField';
import { useGuestStore } from '@/stores/useGuestStore';
import { useAuth } from '@/providers/AuthProvider';
import { insertGuest } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';
import type { Guest, NotificationPref } from '@/types/database';

const RELATIONSHIPS = ['Grandma', 'Grandpa', 'Uncle', 'Aunt', 'Friend', 'Other'];
const NOTIF_OPTIONS = ['SMS', 'Push', 'Both'];
const NOTIF_MAP: Record<string, NotificationPref> = { SMS: 'sms', Push: 'push', Both: 'both' };

export default function AddGuestScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [notifPref, setNotifPref] = useState('SMS');
  const [defaultInvited, setDefaultInvited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const ic = useIconColors();
  const addGuest = useGuestStore((s) => s.addGuest);
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
      notification_pref: NOTIF_MAP[notifPref] ?? 'sms' as NotificationPref,
      default_invited: defaultInvited,
    };

    try {
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
      router.back();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-900" edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Add Guest
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            className={`px-4 py-1.5 rounded-lg ${isSaving ? 'bg-gray-300' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-white">{isSaving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          <FormField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Grandma Kenton"
          />

          <FormField
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 (512) 555-1001"
            keyboardType="phone-pad"
          />

          <FormField
            label="Email (optional)"
            value={email}
            onChangeText={setEmail}
            placeholder="grandma@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <DropdownField
            label="Relationship"
            value={relationship}
            options={RELATIONSHIPS}
            onChange={setRelationship}
          />

          <DropdownField
            label="Notification Preference"
            value={notifPref}
            options={NOTIF_OPTIONS}
            onChange={setNotifPref}
          />

          {/* Default invited toggle */}
          <View className="flex-row items-center justify-between mb-6 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Auto-Invite to All Tournaments
              </Text>
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Automatically invite this guest to every tournament
              </Text>
            </View>
            <Switch
              value={defaultInvited}
              onValueChange={setDefaultInvited}
              trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
              thumbColor={defaultInvited ? '#2563eb' : '#f4f4f5'}
            />
          </View>

          {/* Info card */}
          <View className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-8">
            <View className="flex-row items-start">
              <Ionicons name="information-circle" size={18} color="#2563eb" />
              <Text className="text-xs text-blue-700 dark:text-blue-300 ml-2 flex-1">
                Guests receive automated notifications via SMS or push — no app install required.
                They can RSVP by replying YES, NO, or MAYBE to the SMS.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
