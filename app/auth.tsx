import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useAuth } from '@/providers/AuthProvider';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function AuthScreen() {
  const { signIn, signUp, signInWithGoogle, resetPassword, acceptInvite } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [hasInviteCode, setHasInviteCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
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
        if (error) {
          setLoading(false);
          setMessage({ text: `Sign up error: ${error}`, type: 'error' });
          return;
        }

        // If invite code provided, accept it after signup
        if (hasInviteCode && inviteCode.trim()) {
          const { error: inviteError } = await acceptInvite(inviteCode.trim());
          if (inviteError) {
            setLoading(false);
            setMessage({ text: `Account created but invite failed: ${inviteError}`, type: 'error' });
            return;
          }
        }

        setLoading(false);
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
      }
    } catch (err: any) {
      setLoading(false);
      setMessage({ text: `Unexpected error: ${err?.message ?? String(err)}`, type: 'error' });
    }
  };

  const handleGoogleSignIn = async () => {
    setMessage(null);
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error) {
      setMessage({ text: error, type: 'error' });
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
    <SafeAreaView className="flex-1 bg-bark">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-6"
      >
        {/* Logo area */}
        <View className="items-center mb-10">
          <Image
            source={require('@/assets/images/rallyhub_lockup_white.png')}
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

        {/* Google Sign-In Button */}
        <Pressable
          className={`bg-white rounded-xl py-3.5 items-center mb-4 flex-row justify-center ${googleLoading ? 'opacity-60' : 'active:opacity-80'}`}
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }}
          onPress={handleGoogleSignIn}
          disabled={googleLoading || loading}
        >
          <Ionicons name="logo-google" size={20} color="#4285F4" style={{ marginRight: 10 }} />
          <Text className="text-base font-semibold text-gray-700">
            {googleLoading ? 'Please wait...' : 'Continue with Google'}
          </Text>
        </Pressable>

        {/* Divider */}
        <View className="flex-row items-center mb-4">
          <View className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
          <Text className="mx-4 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>or</Text>
          <View className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }} />
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
          darkBg
        />

        <FormField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          darkBg
        />

        {/* Invite code toggle (sign-up only) */}
        {isSignUp && (
          <>
            <Pressable
              className="mb-3 active:opacity-70"
              onPress={() => setHasInviteCode(!hasInviteCode)}
            >
              <Text className="text-sm text-rally-300 font-semibold">
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
                darkBg
              />
            )}
          </>
        )}

        {/* Forgot password (sign-in only) */}
        {!isSignUp && (
          <Pressable className="items-end mb-2 active:opacity-70" onPress={handleForgotPassword}>
            <Text className="text-sm text-rally-300 font-semibold">Forgot password?</Text>
          </Pressable>
        )}

        {/* Submit button */}
        <Pressable
          className={`bg-rally-500 rounded-xl py-4 items-center mt-2 ${loading ? 'opacity-60' : 'active:opacity-80'}`}
          style={{ shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 4 }}
          onPress={handleSubmit}
          disabled={loading || googleLoading}
        >
          <Text className="text-base font-bold text-cream">
            {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </Text>
        </Pressable>

        {/* Toggle sign in / sign up */}
        <Pressable
          className="mt-6 items-center"
          onPress={() => { setIsSignUp(!isSignUp); setMessage(null); }}
        >
          <Text className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <Text className="text-rally-300 font-semibold">
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </Text>
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
