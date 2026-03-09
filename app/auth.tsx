import { useState } from 'react';
import { View, Text, Pressable, Alert, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FormField from '@/components/FormField';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';

export default function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [hasInviteCode, setHasInviteCode] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter both email and password.');
      return;
    }
    if (isSignUp && hasInviteCode && !inviteCode.trim()) {
      Alert.alert('Missing field', 'Please enter your invite code.');
      return;
    }

    setLoading(true);

    if (isSignUp) {
      const { error } = await signUp(email.trim(), password);
      if (error) {
        setLoading(false);
        Alert.alert('Sign Up Failed', error);
        return;
      }
      Alert.alert('Check your email', 'We sent you a confirmation link. Please verify your email, then sign in.');
      setIsSignUp(false);
      setLoading(false);
    } else {
      const { error } = await signIn(email.trim(), password);
      setLoading(false);
      if (error) {
        Alert.alert('Sign In Failed', error);
        return;
      }
      // After successful sign-in, accept invite code if provided
      if (hasInviteCode && inviteCode.trim()) {
        const { data } = await (supabase.rpc as any)('accept_household_invite', { code: inviteCode.trim() });
        const result = data as { success: boolean; error?: string; message?: string } | null;
        if (result && !result.success) {
          Alert.alert('Invite Error', result.error ?? 'Could not accept invite.');
        } else if (result?.success) {
          Alert.alert('Linked!', result.message ?? 'Your accounts are now linked.');
        }
      }
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Enter email', 'Please enter your email address first, then tap Forgot Password.');
      return;
    }
    setLoading(true);
    const { error } = await resetPassword(email.trim());
    setLoading(false);
    if (error) {
      Alert.alert('Error', error);
    } else {
      Alert.alert('Check your email', 'We sent a password reset link to your email.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-6"
      >
        {/* Logo area */}
        <View className="items-center mb-10">
          <Image
            source={require('@/assets/images/rallyhub_lockup_light.png')}
            style={{ width: 260, height: 72 }}
            resizeMode="contain"
          />
        </View>

        {/* Form */}
        <FormField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <FormField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
        />

        {/* Invite code toggle (sign-up only) */}
        {isSignUp && (
          <>
            <Pressable
              className="mb-3 active:opacity-70"
              onPress={() => setHasInviteCode(!hasInviteCode)}
            >
              <Text className="text-sm text-rally-600 font-semibold">
                {hasInviteCode ? 'Remove invite code' : 'Have an invite code?'}
              </Text>
            </Pressable>
            {hasInviteCode && (
              <FormField
                label="Invite Code"
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="e.g. a1b2c3d4e5f6"
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          </>
        )}

        {/* Forgot password (sign-in only) */}
        {!isSignUp && (
          <Pressable className="items-end mb-2 active:opacity-70" onPress={handleForgotPassword}>
            <Text className="text-sm text-rally-600 font-semibold">Forgot password?</Text>
          </Pressable>
        )}

        {/* Submit button */}
        <Pressable
          className={`bg-rally-600 rounded-xl py-4 items-center mt-2 ${loading ? 'opacity-60' : 'active:opacity-80'}`}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text className="text-base font-semibold text-cream">
            {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </Text>
        </Pressable>

        {/* Toggle sign in / sign up */}
        <Pressable
          className="mt-6 items-center"
          onPress={() => setIsSignUp(!isSignUp)}
        >
          <Text className="text-sm text-stone dark:text-parchment">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <Text className="text-rally-600 font-semibold">
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </Text>
          </Text>
        </Pressable>

        {/* Dev mode bypass hint */}
        {!process.env.EXPO_PUBLIC_SUPABASE_URL && (
          <View className="mt-8 bg-amber-50 rounded-xl p-4">
            <Text className="text-xs text-amber-700 text-center">
              Supabase not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env to enable auth.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
