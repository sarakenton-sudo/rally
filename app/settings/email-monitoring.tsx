import { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateTeamConfig } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';

export default function EmailMonitoringScreen() {
  const ic = useIconColors();
  const teamConfig = useSeasonStore((s) => s.teamConfig);
  const setTeamConfig = useSeasonStore((s) => s.setTeamConfig);
  const { user } = useAuth();
  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  const [trustedEmails, setTrustedEmails] = useState<string[]>(teamConfig?.trusted_sender_emails ?? []);
  const [vipEmails, setVipEmails] = useState<string[]>(teamConfig?.vip_sender_emails ?? []);
  const [newEmail, setNewEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isVip = (email: string) => vipEmails.includes(email);

  const toggleVip = (email: string) => {
    setVipEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (trustedEmails.includes(email)) {
      Alert.alert('Duplicate', 'This email is already in the list.');
      return;
    }
    setTrustedEmails((prev) => [...prev, email]);
    setNewEmail('');
  };

  const removeEmail = (email: string) => {
    setTrustedEmails((prev) => prev.filter((e) => e !== email));
    setVipEmails((prev) => prev.filter((e) => e !== email));
  };

  const handleSave = async () => {
    if (!teamConfig) return;
    setIsSaving(true);

    const updates = {
      trusted_sender_emails: trustedEmails,
      vip_sender_emails: vipEmails,
    };

    try {
      if (isSupabaseConfigured && user) {
        const { error } = await updateTeamConfig(teamConfig.id, updates);
        if (error) {
          Alert.alert('Save failed', error.message);
          return;
        }
      }
      setTeamConfig({ ...teamConfig, ...updates });
      notifySuccess();
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
            Email Monitoring
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
          {/* Info banner */}
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-6 flex-row items-start">
            <Ionicons name="information-circle" size={20} color="#C4714A" />
            <Text className="text-xs text-rally-700 dark:text-rally-300 ml-3 flex-1">
              Add email addresses to monitor for tournament-related emails. VIP senders will trigger push notifications when new emails arrive.
            </Text>
          </View>

          {/* Email list */}
          {trustedEmails.map((email) => (
            <View
              key={email}
              className="bg-cream dark:bg-bark-light rounded-xl px-4 py-3 mb-2 flex-row items-center"
            >
              <View className="flex-1 mr-3">
                <Text className="text-sm font-medium text-bark dark:text-cream">{email}</Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-xs text-stone mr-2">VIP</Text>
                <Switch
                  value={isVip(email)}
                  onValueChange={() => toggleVip(email)}
                  trackColor={{ false: '#EDE4D6', true: '#E4AC85' }}
                  thumbColor={isVip(email) ? '#C4714A' : '#FAF7F3'}
                />
                <Pressable
                  onPress={() => removeEmail(email)}
                  className="ml-3 p-1 active:opacity-60"
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </Pressable>
              </View>
            </View>
          ))}

          {trustedEmails.length === 0 && (
            <View className="bg-cream dark:bg-bark-light rounded-xl p-6 mb-4 items-center">
              <Ionicons name="mail-outline" size={32} color={ic.placeholder} />
              <Text className="text-sm text-stone mt-2">No monitored emails yet</Text>
            </View>
          )}

          {/* Add email row */}
          <View className="flex-row items-center mt-4 mb-8">
            <View className="flex-1 mr-2">
              <TextInput
                className="bg-cream dark:bg-bark-light rounded-xl px-4 py-3 text-sm text-bark dark:text-cream"
                placeholder="coach@example.com"
                placeholderTextColor="#9E8E7E"
                value={newEmail}
                onChangeText={setNewEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={addEmail}
                returnKeyType="done"
              />
            </View>
            <Pressable
              onPress={addEmail}
              className="bg-rally-600 rounded-xl px-4 py-3 active:opacity-80"
            >
              <Text className="text-sm font-semibold text-cream">Add</Text>
            </Pressable>
          </View>

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
