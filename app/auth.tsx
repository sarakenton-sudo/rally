import { useState } from 'react';
import { View, Text, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FormField from '@/components/FormField';
import { useAuth } from '@/providers/AuthProvider';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter both email and password.');
      return;
    }
    setLoading(true);
    const { error } = isSignUp
      ? await signUp(email.trim(), password)
      : await signIn(email.trim(), password);
    setLoading(false);

    if (error) {
      Alert.alert(isSignUp ? 'Sign Up Failed' : 'Sign In Failed', error);
    } else if (isSignUp) {
      Alert.alert('Check your email', 'We sent you a confirmation link. Please verify your email before signing in.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-900">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-6"
      >
        {/* Logo area */}
        <View className="items-center mb-10">
          <Text className="text-5xl font-bold text-rally-600">RALLY</Text>
          <Text className="text-base text-gray-500 dark:text-gray-400 mt-1">
            Select Volleyball Family Hub
          </Text>
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

        {/* Submit button */}
        <Pressable
          className={`bg-rally-600 rounded-xl py-4 items-center mt-2 ${loading ? 'opacity-60' : 'active:opacity-80'}`}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text className="text-base font-semibold text-white">
            {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
          </Text>
        </Pressable>

        {/* Toggle sign in / sign up */}
        <Pressable
          className="mt-6 items-center"
          onPress={() => setIsSignUp(!isSignUp)}
        >
          <Text className="text-sm text-gray-500 dark:text-gray-400">
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
