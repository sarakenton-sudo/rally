import { useState } from 'react';
import { View, Text, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useAuth } from '@/providers/AuthProvider';
import { useIconColors } from '@/lib/colors';
import { notifySuccess } from '@/lib/haptics';

export default function ChangePasswordScreen() {
  const ic = useIconColors();
  const { updatePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!newPassword.trim()) {
      Alert.alert('Missing field', 'Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Too short', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    setSaving(true);
    const { error } = await updatePassword(newPassword);
    setSaving(false);

    if (error) {
      Alert.alert('Error', error);
    } else {
      notifySuccess();
      Alert.alert('Success', 'Your password has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
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
          <Text className="text-lg font-bold text-bark dark:text-cream">Change Password</Text>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            className={`px-4 py-1.5 rounded-lg ${saving ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
          >
            <Text className="text-sm font-semibold text-cream">{saving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>

        <View className="flex-1 px-4 pt-6">
          <FormField
            label="New Password"
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="new-password"
          />
          <FormField
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="new-password"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
