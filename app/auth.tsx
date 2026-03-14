import { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Image, ScrollView } from 'react-native';
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
        if (error) { setLoading(false); setMessage({ text: `Sign up error: ${error}`, type: 'error' }); return; }
        if (hasInviteCode && inviteCode.trim()) {
          const { error: inviteError } = await acceptInvite(inviteCode.trim());
          if (inviteError) { setLoading(false); setMessage({ text: `Account created but invite failed: ${inviteError}`, type: 'error' }); return; }
        }
        setLoading(false);
        setMessage({ text: 'Account created! Check your email for a confirmation link, then sign in.', type: 'success' });
        setIsSignUp(false);
      } else {
        const { error } = await signIn(email.trim(), password);
        setLoading(false);
        if (error) { setMessage({ text: `Sign in error: ${error}`, type: 'error' }); return; }
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
    if (error) setMessage({ text: error, type: 'error' });
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) { setMessage({ text: 'Enter your email address first, then tap Forgot Password.', type: 'error' }); return; }
    setLoading(true);
    const { error } = await resetPassword(email.trim());
    setLoading(false);
    if (error) { setMessage({ text: error, type: 'error' }); }
    else { setMessage({ text: 'Check your email for a password reset link.', type: 'success' }); }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#1E3A5F' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo area */}
          <View className="items-center mb-10">
            <Image
              source={require('@/assets/images/rallyhub_lockup_white.png')}
              style={{ width: 240, height: 64 }}
              resizeMode="contain"
            />
            <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 8, fontSize: 14, fontFamily: 'NunitoSans-Regular' }}>
              Your family's volleyball command center
            </Text>
          </View>

          {/* Status message */}
          {message && (
            <View
              style={{
                borderRadius: 14,
                padding: 14,
                marginBottom: 16,
                backgroundColor: message.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(106,158,138,0.15)',
                borderWidth: 1.5,
                borderColor: message.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(106,158,138,0.35)',
              }}
            >
              <Text style={{
                fontSize: 13,
                textAlign: 'center',
                fontFamily: 'NunitoSans-SemiBold',
                color: message.type === 'error' ? '#fca5a5' : '#6A9E8A',
              }}>
                {message.text}
              </Text>
            </View>
          )}

          {/* Supabase debug */}
          {!isSupabaseConfigured && (
            <View style={{ backgroundColor: 'rgba(251,146,60,0.2)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1.5, borderColor: 'rgba(251,146,60,0.35)' }}>
              <Text style={{ fontSize: 12, color: '#FB923C', textAlign: 'center', fontFamily: 'NunitoSans-Bold' }}>
                Supabase not configured. Auth will not work.
              </Text>
            </View>
          )}

          {/* Google Sign-In Button */}
          <Pressable
            style={{
              backgroundColor: '#FEFEFE',
              borderRadius: 14,
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 12,
              elevation: 4,
              opacity: googleLoading ? 0.6 : 1,
            }}
            onPress={handleGoogleSignIn}
            disabled={googleLoading || loading}
          >
            <Ionicons name="logo-google" size={20} color="#4285F4" style={{ marginRight: 10 }} />
            <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-Bold', color: '#3a5a7a' }}>
              {googleLoading ? 'Please wait...' : 'Continue with Google'}
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
            <Text style={{ marginHorizontal: 16, fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'NunitoSans-Regular' }}>or</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
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

          {/* Invite code toggle */}
          <Pressable className="mb-3 active:opacity-70" onPress={() => setHasInviteCode(!hasInviteCode)}>
            <Text style={{ fontSize: 13, color: '#7DBDD9', fontFamily: 'NunitoSans-SemiBold' }}>
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

          {/* Forgot password (sign-in only) */}
          {!isSignUp && (
            <Pressable style={{ alignItems: 'flex-end', marginBottom: 8 }} className="active:opacity-70" onPress={handleForgotPassword}>
              <Text style={{ fontSize: 13, color: '#7DBDD9', fontFamily: 'NunitoSans-SemiBold' }}>Forgot password?</Text>
            </Pressable>
          )}

          {/* Submit button — homepage-style steel blue with shadow */}
          <Pressable
            style={{
              backgroundColor: '#3B82B0',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              marginTop: 8,
              shadowColor: '#3B82B0',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.45,
              shadowRadius: 20,
              elevation: 6,
              opacity: loading ? 0.6 : 1,
            }}
            onPress={handleSubmit}
            disabled={loading || googleLoading}
          >
            <Text style={{ fontSize: 15, fontFamily: 'Nunito-ExtraBold', color: '#FEFEFE' }}>
              {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
            </Text>
          </Pressable>

          {/* Toggle sign in / sign up */}
          <Pressable style={{ marginTop: 28, alignItems: 'center' }} onPress={() => { setIsSignUp(!isSignUp); setMessage(null); }}>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'NunitoSans-Regular' }}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={{ color: '#7DBDD9', fontFamily: 'NunitoSans-SemiBold' }}>
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
