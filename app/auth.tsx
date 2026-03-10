import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FormField from '@/components/FormField';
import { useAuth } from '@/providers/AuthProvider';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export default function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [hasInviteCode, setHasInviteCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null);

  const handleSubmit = async () => {
    setMessage(null);

    if (!email.trim() || !password.trim()) {
      setMessage({ text: 'Please enter both email and password.', type: 'error' });
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email.trim(), password);
        setLoading(false);
        if (error) {
          setMessage({ text: `Sign up error: ${error}`, type: 'error' });
          return;
        }
        setMessage({ text: 'Account created! Check your email for a confirmation link, then sign in.', type: 'success' });
        setIsSignUp(false);
      } else {
        const { error } = await signIn(email.trim(), password);
        setLoading(false);
        if (error) {
          setMessage({ text: `Sign in error: ${error}`, type: 'error' });
          return;
        }
        setMessage({ text: 'Signed in! Redirecting...', type: 'success' });
        // Navigation happens automatically via _layout.tsx auth gating
      }
    } catch (err: any) {
      setLoading(false);
      setMessage({ text: `Unexpected error: ${err?.message ?? String(err)}`, type: 'error' });
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setMessage({ text: 'Enter your email address first, then tap Forgot Password.', type: 'error' });
      return;
    }
    setLoading(true);
    const { error } = await resetPassword(email.trim());
    setLoading(false);
    if (error) {
      setMessage({ text: error, type: 'error' });
    } else {
      setMessage({ text: 'Check your email for a password reset link.', type: 'success' });
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

        {/* Status message */}
        {message && (
          <View className={`rounded-xl p-4 mb-4 ${message.type === 'error' ? 'bg-red-50' : 'bg-green-50'}`}>
            <Text className={`text-sm text-center font-semibold ${message.type === 'error' ? 'text-red-600' : 'text-green-700'}`}>
              {message.text}
            </Text>
          </View>
        )}

        {/* Supabase debug */}
        {!isSupabaseConfigured && (
          <View className="bg-amber-50 rounded-xl p-4 mb-4">
            <Text className="text-xs text-amber-700 text-center font-bold">
              Supabase not configured. Auth will not work.
            </Text>
          </View>
        )}

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
          onPress={() => { setIsSignUp(!isSignUp); setMessage(null); }}
        >
          <Text className="text-sm text-stone dark:text-parchment">
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <Text className="text-rally-600 font-semibold">
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
