import { useState } from 'react';
import { View, Text, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import FormField from '@/components/FormField';
import { useAuth } from '@/providers/AuthProvider';
import { useIconColors } from '@/lib/colors';
import { supabase } from '@/lib/supabase';
import { tapLight, notifySuccess } from '@/lib/haptics';

export default function InviteCoParentScreen() {
  const ic = useIconColors();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const handleSendInvite = async () => {
    if (!email.trim()) {
      Alert.alert('Missing field', 'Please enter an email address.');
      return;
    }

    setSending(true);
    const { data, error } = await supabase
      .from('household_invites')
      .insert({
        owner_user_id: user!.id,
        email: email.trim().toLowerCase(),
      } as any)
      .select()
      .single();
    setSending(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      notifySuccess();
      setInviteCode((data as any).invite_code);
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    tapLight();
    Alert.alert('Copied', 'Invite code copied to clipboard. Share it with your co-parent.');
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
          <Text className="text-lg font-bold text-bark dark:text-cream">Invite Co-Parent</Text>
          <View style={{ width: 32 }} />
        </View>

        <View className="flex-1 px-4 pt-6">
          {!inviteCode ? (
            <>
              <Text className="text-sm text-stone dark:text-parchment mb-4">
                Enter your co-parent's email. They'll create their own account and use the invite code to link to your data.
              </Text>

              <FormField
                label="Co-Parent Email"
                value={email}
                onChangeText={setEmail}
                placeholder="coparent@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />

              <Pressable
                className={`bg-rally-600 rounded-xl py-4 items-center mt-2 ${sending ? 'opacity-60' : 'active:opacity-80'}`}
                onPress={handleSendInvite}
                disabled={sending}
              >
                <Text className="text-base font-semibold text-cream">
                  {sending ? 'Creating...' : 'Create Invite'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View className="items-center mt-6">
                <Ionicons name="checkmark-circle" size={48} color="#6A9E8A" />
                <Text className="text-lg font-bold text-bark dark:text-cream mt-3">
                  Invite Created
                </Text>
                <Text className="text-sm text-stone dark:text-parchment mt-2 text-center">
                  Share this code with your co-parent. They'll enter it when creating their account.
                </Text>
              </View>

              <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-5 mt-6 items-center border border-rally-200 dark:border-rally-800">
                <Text className="text-xs text-stone uppercase tracking-wider mb-2">Invite Code</Text>
                <Text className="text-2xl font-bold text-rally-600 tracking-widest font-mono">
                  {inviteCode}
                </Text>
              </View>

              <Pressable
                className="bg-rally-600 rounded-xl py-4 items-center mt-4 active:opacity-80"
                onPress={handleCopyCode}
              >
                <Text className="text-base font-semibold text-cream">Copy Code</Text>
              </Pressable>

              <Pressable
                className="rounded-xl py-3 items-center mt-3 active:opacity-70"
                onPress={() => router.back()}
              >
                <Text className="text-sm font-semibold text-rally-600">Done</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
