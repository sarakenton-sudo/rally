import { useState } from 'react';
import { View, Text, Pressable, Alert, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { useDataRefresh } from '@/providers/DataProvider';
import { useIconColors } from '@/lib/colors';
import { tapLight, notifySuccess } from '@/lib/haptics';

export default function TrustedEmailsScreen() {
  const ic = useIconColors();
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const { refresh } = useDataRefresh();

  const trustedEmails = adminConfig?.trusted_sender_emails ?? [];
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      Alert.alert('Missing Email', 'Please enter an email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (trustedEmails.includes(email)) {
      Alert.alert('Already Added', 'This email is already in your list.');
      setNewEmail('');
      return;
    }

    setSaving(true);
    const updated = [...trustedEmails, email];
    const { error } = await updateAdminConfig(adminConfig!.id, { trusted_sender_emails: updated } as any);
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      if (adminConfig) {
        setAdminConfig({ ...adminConfig, trusted_sender_emails: updated });
      }
      notifySuccess();
      setNewEmail('');
    }
  };

  const handleRemove = (email: string) => {
    Alert.alert('Remove Email', `Remove ${email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const updated = trustedEmails.filter((e) => e !== email);
          const { error } = await updateAdminConfig(adminConfig!.id, { trusted_sender_emails: updated } as any);
          if (!error && adminConfig) {
            setAdminConfig({ ...adminConfig, trusted_sender_emails: updated });
            tapLight();
          }
        },
      },
    ]);
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
          <Text className="text-lg font-bold text-bark dark:text-cream">My Email Addresses</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView className="flex-1 px-4 pt-6" keyboardShouldPersistTaps="handled">
          {/* Explanation */}
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 border border-rally-200 dark:border-rally-800 mb-6">
            <Text className="text-sm text-rally-700 dark:text-rally-300 font-semibold mb-1">
              Why add email addresses?
            </Text>
            <Text className="text-xs text-stone dark:text-parchment leading-5">
              We already have the email you registered with — you're all set there! But you might book travel or forward confirmations from other accounts — personal, work, or a partner's. Add them here so RallyHUB recognizes those emails as yours and adds critical information to your itineraries.
            </Text>
          </View>

          {/* Current emails */}
          {trustedEmails.length > 0 && (
            <View className="mb-6">
              <Text className="text-xs text-stone uppercase tracking-wider font-bold mb-3">Your Email Addresses</Text>
              {trustedEmails.map((email) => (
                <View
                  key={email}
                  className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900 flex-row items-center"
                >
                  <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: 'rgba(59,130,176,0.1)' }}>
                    <Ionicons name="mail" size={16} color="#3B82B0" />
                  </View>
                  <Text className="text-sm text-bark dark:text-cream flex-1">{email}</Text>
                  <Pressable onPress={() => handleRemove(email)} className="p-2 active:opacity-60">
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {trustedEmails.length === 0 && (
            <View className="items-center py-8 mb-4">
              <Ionicons name="mail-outline" size={40} color="#8FA8BF" />
              <Text className="text-sm text-stone mt-3 text-center px-8">
                No extra email addresses added yet. Add any email you use to book hotels, flights, or receive tournament info.
              </Text>
            </View>
          )}

          {/* Add new */}
          <Text className="text-xs text-stone uppercase tracking-wider font-bold mb-2">Add Email Address</Text>
          <FormField
            label=""
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="e.g. sara@quietstandardco.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />

          <Pressable
            className={`bg-rally-600 rounded-xl py-4 items-center mt-2 ${saving ? 'opacity-60' : 'active:opacity-80'}`}
            onPress={handleAdd}
            disabled={saving}
          >
            <Text className="text-base font-semibold text-cream">
              {saving ? 'Adding...' : 'Add Email'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
