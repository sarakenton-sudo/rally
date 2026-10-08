import { useEffect, useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, Image, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useAuth } from '@/providers/AuthProvider';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { AccountType } from '@/types/database';
import { rememberCoachInvite } from '@/lib/coachInvites';
import { rememberFanCode, checkFanCode } from '@/lib/fan';
import { useLocalSearchParams } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { savePendingMarketing, MARKETING_CONSENT_LABEL } from '@/lib/marketing';

function getInitialSignUp(): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    return params.get('signup') === 'true';
  }
  return false;
}

function getInitialInvite(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search).get('invite')?.trim() ?? '';
  }
  return '';
}

/** rally-hub.com/coaches?i=CODE → sign-up carries &i=CODE: remember it so the
 *  inviting family is connected once the coach profile exists. */
function captureCoachInvite() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const code = new URLSearchParams(window.location.search).get('i');
    if (code) rememberCoachInvite(code);
  }
}
captureCoachInvite();

/** rally-hub.com/fan/CODE → sign-up carries ?fan=CODE: accepted once the account exists. */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const fan = new URLSearchParams(window.location.search).get('fan');
  if (fan) rememberFanCode(fan);
}

/** rally-hub.com/fan/CODE → /auth?signup=true&fan=CODE: start as a Fan with the code filled in. */
function getInitialFanCode(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return (new URLSearchParams(window.location.search).get('fan') ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
  }
  return '';
}

/** Homepage "Set up your coach page" links here with ?signup=true&role=coach. */
function getInitialAccountType(): AccountType {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search).get('role') === 'coach' ? 'coach' : 'parent';
  }
  return 'parent';
}

export default function AuthScreen() {
  const { signIn, signUp, signInWithGoogle, signInWithApple, resetPassword, acceptInvite } = useAuth();
  // Sign in with Apple: iPhone only (App Store 4.8 — offered alongside Google).
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);
  const handleAppleSignIn = async () => {
    setMessage(null);
    if (isSignUp) savePendingMarketing(marketing, 'signup_apple');
    if (!(await fanCodeOk())) return;
    const { error } = await signInWithApple(isSignUp ? accountType : undefined);
    if (error) setMessage({ text: error, type: 'error' });
  };
  const [isSignUp, setIsSignUp] = useState(getInitialSignUp);
  const [accountType, setAccountType] = useState<AccountType>(getInitialAccountType);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Invite emails link to /auth?signup=true&invite=CODE so the code is pre-filled.
  const [inviteCode, setInviteCode] = useState(getInitialInvite);
  const [marketing, setMarketing] = useState(true);
  const [hasInviteCode, setHasInviteCode] = useState(() => !!getInitialInvite());
  // Fans sign up with the code from their invite text (rally-hub.com/fan/CODE pre-fills it).
  const [isFan, setIsFan] = useState(() => !!getInitialFanCode());
  const [fanCode, setFanCode] = useState(getInitialFanCode);
  const hasFanCode = isSignUp && isFan;
  // In the app, the fan invite page passes ?fan=CODE as a route param.
  const params = useLocalSearchParams<{ fan?: string }>();
  useEffect(() => {
    const c = String(params.fan ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
    if (c) { setIsFan(true); setFanCode(c); setIsSignUp(true); }
  }, [params.fan]);
  // Accepted after sign-up (AuthProvider), which routes the new account to the fan view.
  const rememberTypedFanCode = () => { if (hasFanCode && fanCode.trim()) rememberFanCode(fanCode.trim()); };
  /** Fans: check the code before creating the account, so a typo gets a clear message. */
  const fanCodeOk = async (): Promise<boolean> => {
    if (!hasFanCode) return true;
    if (!fanCode.trim()) { setMessage({ text: 'Enter the fan code from your invite text.', type: 'error' }); return false; }
    const { ok } = await checkFanCode(fanCode);
    if (!ok) { setMessage({ text: "That fan code isn't valid or was already used. If you already joined with it, tap Sign In instead. Otherwise check the 8 letters and numbers in your invite, or ask the family for a new one.", type: 'error' }); return false; }
    rememberTypedFanCode();
    return true;
  };
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(null);
  // Early access gate: set to false to re-enable Google OAuth signup
  const earlyAccessMode = false;

  const handleSubmit = async () => {
    setMessage(null);
    if (!email.trim() || !password.trim()) {
      setMessage({ text: 'Please enter both email and password.', type: 'error' });
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        savePendingMarketing(marketing, 'signup_email'); // recorded once the new profile loads
        if (!(await fanCodeOk())) { setLoading(false); return; }
        const { error } = await signUp(email.trim(), password, accountType, hasFanCode ? fanCode.trim() : undefined);
        if (error) { setLoading(false); setMessage({ text: `Sign up error: ${error}`, type: 'error' }); return; }
        if (hasInviteCode && !hasFanCode && inviteCode.trim()) {
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
    // Google can't carry the Coach choice itself — pass it so it's applied after sign-in.
    if (isSignUp) savePendingMarketing(marketing, 'signup_google');
    if (!(await fanCodeOk())) { setGoogleLoading(false); return; }
    const { error } = await signInWithGoogle(isSignUp ? accountType : undefined);
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

          {/* Sign in | Create account — up top so new people find sign-up (and the Parent/Fan/Coach choice) */}
          <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 4, marginBottom: 18 }}>
            {([[false, 'Sign in'], [true, 'Create account']] as const).map(([up, label]) => {
              const on = isSignUp === up;
              return (
                <Pressable
                  key={label}
                  onPress={() => { setIsSignUp(up); setMessage(null); }}
                  style={{ flex: 1, paddingVertical: 11, borderRadius: 9, alignItems: 'center', backgroundColor: on ? '#FEFEFE' : 'transparent' }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={label}
                >
                  <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: on ? '#1E3A5F' : 'rgba(255,255,255,0.7)' }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Status message */}
          {message && (
            <View
              style={{
                borderRadius: 14,
                padding: 14,
                marginBottom: 16,
                backgroundColor: message.type === 'info' ? 'rgba(59,130,176,0.15)' : message.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(106,158,138,0.15)',
                borderWidth: 1.5,
                borderColor: message.type === 'info' ? 'rgba(59,130,176,0.35)' : message.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(106,158,138,0.35)',
              }}
            >
              <Text style={{
                fontSize: 13,
                textAlign: 'center',
                fontFamily: 'NunitoSans-SemiBold',
                color: message.type === 'info' ? '#7DBDD9' : message.type === 'error' ? '#fca5a5' : '#6A9E8A',
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

          {/* Account type picker (sign-up only) — above Google + email so it applies to both */}
          {isSignUp && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: 'NunitoSans-SemiBold', marginBottom: 8 }}>I am a...</Text>
              <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 4 }}>
                {(['parent', 'fan', 'coach'] as const).map((t) => {
                  const on = t === 'fan' ? isFan : !isFan && accountType === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => { setIsFan(t === 'fan'); setAccountType(t === 'coach' ? 'coach' : 'parent'); }}
                      accessibilityLabel={t === 'fan' ? 'Fan' : t === 'parent' ? 'Parent' : 'Coach'}
                      style={{ flex: 1, paddingVertical: 11, borderRadius: 9, alignItems: 'center', backgroundColor: on ? '#3B82B0' : 'transparent' }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: on ? '#FEFEFE' : 'rgba(255,255,255,0.6)' }}>
                        {t === 'parent' ? 'Parent' : t === 'fan' ? 'Fan' : 'Coach'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {isFan && (
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'NunitoSans-Regular', marginTop: 8 }}>
                  Following a grandkid, niece or friend? Use the fan code from the family's invite text.
                </Text>
              )}
              {!isFan && accountType === 'coach' && (
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'NunitoSans-Regular', marginTop: 8 }}>
                  Set up your private-lesson business — listing, availability, and bookings.
                </Text>
              )}

              {/* Email marketing consent — pre-checked (US email); applies to Google and email sign-up.
                  Athlete accounts are never opted in (enforced in the database). */}
              <Pressable
                onPress={() => setMarketing(!marketing)}
                style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: marketing }}
                aria-checked={marketing}
                accessibilityLabel={MARKETING_CONSENT_LABEL}
              >
                <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: marketing ? '#3B82B0' : 'rgba(255,255,255,0.4)', backgroundColor: marketing ? '#3B82B0' : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  {marketing && <Ionicons name="checkmark" size={13} color="#FEFEFE" />}
                </View>
                <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.6)', fontFamily: 'NunitoSans-Regular', marginLeft: 8 }}>
                  {MARKETING_CONSENT_LABEL}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Sign in with Apple — Apple's own button, above Google (iPhone only) */}
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={isSignUp ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={14}
              style={{ height: 50, marginBottom: 10 }}
              onPress={handleAppleSignIn}
            />
          )}

          {/* Google Sign-In Button — disabled during early access. Set earlyAccessMode = false to re-enable. */}
          {!earlyAccessMode && (
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
          )}

          {/* Divider — hidden when Google button is hidden during early access */}
          {!earlyAccessMode && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
              <Text style={{ marginHorizontal: 16, fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'NunitoSans-Regular' }}>or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' }} />
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
            darkBg
          />

          <FormField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            autoCapitalize="none"
            autoCorrect={false}
            darkBg
          />
          <Pressable onPress={() => setShowPassword(!showPassword)} className="flex-row items-center -mt-2 mb-3 self-start active:opacity-70">
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={15} color="#7DBDD9" />
            <Text style={{ fontSize: 12, color: '#7DBDD9', fontFamily: 'NunitoSans-SemiBold', marginLeft: 5 }}>
              {showPassword ? 'Hide password' : 'Show password'}
            </Text>
          </Pressable>
          {isSignUp && Platform.OS === 'web' && (
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'NunitoSans-Regular', marginTop: -6, marginBottom: 12 }}>
              On iPhone, if Safari fills a "Strong Password" you can't change, tap "Other Options" → "Choose My Own Password".
            </Text>
          )}

          {/* Co-parent / athlete invite code (not for fans) */}
          {!hasFanCode && (
            <Pressable className="mb-3 active:opacity-70" onPress={() => setHasInviteCode(!hasInviteCode)}>
              <Text style={{ fontSize: 13, color: '#7DBDD9', fontFamily: 'NunitoSans-SemiBold' }}>
                {hasInviteCode ? 'Remove invite code' : 'Joining as a co-parent? Enter your invite code'}
              </Text>
            </Pressable>
          )}
          {hasInviteCode && !hasFanCode && (
            <FormField
              label="Invite Code"
              value={inviteCode}
              onChangeText={(t) => setInviteCode(t.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())}
              placeholder="e.g. a1b2c3d4e5f6"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              keyboardType="ascii-capable"
              darkBg
            />
          )}

          {/* Fan code (sign-up as Fan): required, checked before the account is created */}
          {hasFanCode && (
            <FormField
              label="Fan Code"
              value={fanCode}
              onChangeText={(t) => setFanCode(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8))}
              placeholder="8 letters and numbers, e.g. 6C2DR3TA"
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              keyboardType="ascii-capable"
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

          {/* Legal links */}
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'NunitoSans-Regular', textAlign: 'center', marginTop: 24, lineHeight: 18 }}>
            By continuing you agree to our{' '}
            <Text
              style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'NunitoSans-SemiBold', textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL('https://rally-hub.com/terms')}
            >
              Terms of Use
            </Text>
            {' '}and{' '}
            <Text
              style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'NunitoSans-SemiBold', textDecorationLine: 'underline' }}
              onPress={() => Linking.openURL('https://rally-hub.com/privacy')}
            >
              Privacy Policy
            </Text>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
