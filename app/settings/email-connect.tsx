import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateTeamConfig } from '@/hooks/useSupabaseData';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, tapLight } from '@/lib/haptics';

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export default function EmailConnectScreen() {
  const ic = useIconColors();
  const teamConfig = useSeasonStore((s) => s.teamConfig);
  const setTeamConfig = useSeasonStore((s) => s.setTeamConfig);
  const { user, session } = useAuth();
  const isSupabaseConfigured = !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  // Gmail connection state
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Trusted senders (from email-monitoring)
  const [trustedEmails, setTrustedEmails] = useState<string[]>(teamConfig?.trusted_sender_emails ?? []);
  const [vipEmails, setVipEmails] = useState<string[]>(teamConfig?.vip_sender_emails ?? []);
  const [newTrustedEmail, setNewTrustedEmail] = useState('');

  // Travel accounts (from travel-sync)
  const [travelEmails, setTravelEmails] = useState<string[]>(teamConfig?.travel_sync_emails ?? []);
  const [newTravelEmail, setNewTravelEmail] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  // ============================================================
  // Gmail OAuth
  // ============================================================
  const connectGmail = useCallback(async () => {
    if (!user || !GOOGLE_CLIENT_ID) {
      Alert.alert('Configuration Error', 'Google Client ID is not configured.');
      return;
    }

    setIsConnecting(true);
    try {
      const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-auth-callback`;
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        access_type: 'offline',
        prompt: 'consent',
        state: user.id,
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, 'rally://auth/gmail-callback');

      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const success = url.searchParams.get('success') === 'true';
        const email = url.searchParams.get('email');
        const error = url.searchParams.get('error');

        if (success && email && teamConfig) {
          setTeamConfig({ ...teamConfig, gmail_connected: true, gmail_email: email });
          notifySuccess();
          Alert.alert('Connected', `Gmail connected: ${email}`);
        } else {
          Alert.alert('Connection Failed', error ?? 'Unable to connect Gmail. Please try again.');
        }
      }
    } catch (err) {
      console.error('Gmail connect error:', err);
      Alert.alert('Error', 'An error occurred while connecting Gmail.');
    } finally {
      setIsConnecting(false);
    }
  }, [user, teamConfig, setTeamConfig]);

  const disconnectGmail = useCallback(async () => {
    Alert.alert('Disconnect Gmail', 'Stop auto-syncing emails from Gmail?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setIsDisconnecting(true);
          try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/gmail-auth-callback`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({ action: 'disconnect' }),
            });

            if (response.ok && teamConfig) {
              setTeamConfig({ ...teamConfig, gmail_connected: false, gmail_email: null });
              notifySuccess();
            } else {
              Alert.alert('Error', 'Failed to disconnect Gmail.');
            }
          } catch (err) {
            console.error('Gmail disconnect error:', err);
            Alert.alert('Error', 'An error occurred while disconnecting Gmail.');
          } finally {
            setIsDisconnecting(false);
          }
        },
      },
    ]);
  }, [session, teamConfig, setTeamConfig]);

  // ============================================================
  // Trusted sender helpers
  // ============================================================
  const isVip = (email: string) => vipEmails.includes(email);

  const toggleVip = (email: string) => {
    setVipEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const addTrustedEmail = () => {
    const email = newTrustedEmail.trim().toLowerCase();
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
    setNewTrustedEmail('');
  };

  const removeTrustedEmail = (email: string) => {
    setTrustedEmails((prev) => prev.filter((e) => e !== email));
    setVipEmails((prev) => prev.filter((e) => e !== email));
  };

  // ============================================================
  // Travel email helpers
  // ============================================================
  const addTravelEmail = () => {
    const email = newTravelEmail.trim().toLowerCase();
    if (!email) return;
    if (!email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (travelEmails.includes(email)) {
      Alert.alert('Duplicate', 'This email is already in the list.');
      return;
    }
    setTravelEmails((prev) => [...prev, email]);
    setNewTravelEmail('');
  };

  const removeTravelEmail = (email: string) => {
    setTravelEmails((prev) => prev.filter((e) => e !== email));
  };

  // ============================================================
  // Save all
  // ============================================================
  const handleSave = async () => {
    if (!teamConfig) return;
    setIsSaving(true);

    const updates = {
      trusted_sender_emails: trustedEmails,
      vip_sender_emails: vipEmails,
      travel_sync_emails: travelEmails,
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

  const gmailConnected = teamConfig?.gmail_connected ?? false;
  const gmailEmail = teamConfig?.gmail_email;

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
            Email & Sync
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
          {/* ============================================================ */}
          {/* GMAIL CONNECTION */}
          {/* ============================================================ */}
          <Text className="text-xs font-semibold text-stone dark:text-parchment uppercase tracking-wider mb-2 ml-1">
            Gmail Connection
          </Text>

          {gmailConnected && gmailEmail ? (
            <View className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-4 border border-green-200 dark:border-green-800">
              <View className="flex-row items-center mb-2">
                <View className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 items-center justify-center mr-3">
                  <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-green-800 dark:text-green-200">
                    Connected
                  </Text>
                  <Text className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                    {gmailEmail}
                  </Text>
                </View>
                <Pressable
                  onPress={disconnectGmail}
                  disabled={isDisconnecting}
                  className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 active:opacity-80"
                >
                  <Text className="text-xs font-semibold text-red-600 dark:text-red-400">
                    {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-4 border border-rally-200 dark:border-rally-800">
              <View className="flex-row items-start mb-3">
                <Ionicons name="mail-outline" size={20} color="#3B82B0" />
                <Text className="text-xs text-rally-700 dark:text-rally-300 ml-3 flex-1">
                  Connect Gmail to auto-detect travel confirmations and team emails. Rally scans every 15 minutes — read-only, we never send emails.
                </Text>
              </View>
              <Pressable
                onPress={connectGmail}
                disabled={isConnecting}
                className={`rounded-lg py-3 items-center ${isConnecting ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
              >
                <View className="flex-row items-center">
                  <Ionicons name="logo-google" size={16} color="#FEFEFE" />
                  <Text className="text-sm font-semibold text-cream ml-2">
                    {isConnecting ? 'Connecting...' : 'Connect Gmail'}
                  </Text>
                </View>
              </Pressable>
            </View>
          )}

          {/* ============================================================ */}
          {/* TRUSTED SENDERS */}
          {/* ============================================================ */}
          <Text className="text-xs font-semibold text-stone dark:text-parchment uppercase tracking-wider mb-2 ml-1 mt-4">
            Trusted Senders
          </Text>

          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-3 flex-row items-start">
            <Ionicons name="information-circle" size={18} color="#3B82B0" />
            <Text className="text-xs text-rally-700 dark:text-rally-300 ml-3 flex-1">
              Emails from these senders are processed. Toggle VIP to trigger push notifications. Leave empty to scan all incoming emails.
            </Text>
          </View>

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
                  trackColor={{ false: '#D8E2EC', true: '#7DBDD9' }}
                  thumbColor={isVip(email) ? '#3B82B0' : '#FEFEFE'}
                />
                <Pressable
                  onPress={() => removeTrustedEmail(email)}
                  className="ml-3 p-1 active:opacity-60"
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </Pressable>
              </View>
            </View>
          ))}

          {trustedEmails.length === 0 && (
            <View className="bg-cream dark:bg-bark-light rounded-xl p-5 mb-2 items-center">
              <Ionicons name="mail-outline" size={28} color={ic.placeholder} />
              <Text className="text-sm text-stone mt-2">No trusted senders — all emails will be scanned</Text>
            </View>
          )}

          <View className="flex-row items-center mt-2 mb-4">
            <View className="flex-1 mr-2">
              <TextInput
                className="bg-cream dark:bg-bark-light rounded-xl px-4 py-3 text-sm text-bark dark:text-cream"
                placeholder="coach@example.com"
                placeholderTextColor="#8FA8BF"
                value={newTrustedEmail}
                onChangeText={setNewTrustedEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={addTrustedEmail}
                returnKeyType="done"
              />
            </View>
            <Pressable
              onPress={addTrustedEmail}
              className="bg-rally-600 rounded-xl px-4 py-3 active:opacity-80"
            >
              <Text className="text-sm font-semibold text-cream">Add</Text>
            </Pressable>
          </View>

          {/* ============================================================ */}
          {/* TRAVEL ACCOUNTS */}
          {/* ============================================================ */}
          <Text className="text-xs font-semibold text-stone dark:text-parchment uppercase tracking-wider mb-2 ml-1 mt-4">
            Travel Accounts
          </Text>

          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-3 flex-row items-start">
            <Ionicons name="information-circle" size={18} color="#3B82B0" />
            <Text className="text-xs text-rally-700 dark:text-rally-300 ml-3 flex-1">
              Email accounts that book travel — yours, co-parent's, grandparents. Rally watches for hotel and flight confirmations.
            </Text>
          </View>

          {travelEmails.map((email) => (
            <View
              key={email}
              className="bg-cream dark:bg-bark-light rounded-xl px-4 py-3 mb-2 flex-row items-center"
            >
              <Ionicons name="airplane-outline" size={18} color="#3B82B0" />
              <Text className="text-sm font-medium text-bark dark:text-cream flex-1 ml-3">{email}</Text>
              <Pressable
                onPress={() => removeTravelEmail(email)}
                className="p-1 active:opacity-60"
                hitSlop={8}
              >
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </Pressable>
            </View>
          ))}

          {travelEmails.length === 0 && (
            <View className="bg-cream dark:bg-bark-light rounded-xl p-5 mb-2 items-center">
              <Ionicons name="airplane-outline" size={28} color={ic.placeholder} />
              <Text className="text-sm text-stone mt-2">No travel email accounts added</Text>
            </View>
          )}

          <View className="flex-row items-center mt-2 mb-4">
            <View className="flex-1 mr-2">
              <TextInput
                className="bg-cream dark:bg-bark-light rounded-xl px-4 py-3 text-sm text-bark dark:text-cream"
                placeholder="parent@email.com"
                placeholderTextColor="#8FA8BF"
                value={newTravelEmail}
                onChangeText={setNewTravelEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={addTravelEmail}
                returnKeyType="done"
              />
            </View>
            <Pressable
              onPress={addTravelEmail}
              className="bg-rally-600 rounded-xl px-4 py-3 active:opacity-80"
            >
              <Text className="text-sm font-semibold text-cream">Add</Text>
            </Pressable>
          </View>

          {/* ============================================================ */}
          {/* MANUAL FORWARD FALLBACK */}
          {/* ============================================================ */}
          <Text className="text-xs font-semibold text-stone dark:text-parchment uppercase tracking-wider mb-2 ml-1 mt-4">
            Manual Forward Fallback
          </Text>

          {teamConfig?.rally_forward_address && (
            <View className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 mb-4">
              <View className="flex-row items-start mb-3">
                <Ionicons name="bulb-outline" size={18} color="#d97706" />
                <Text className="text-xs text-amber-700 dark:text-amber-300 ml-3 flex-1">
                  Forward emails here if Gmail sync misses something.
                </Text>
              </View>
              <View className="flex-row items-center bg-warm-white dark:bg-bark-light rounded-lg p-3">
                <Text className="text-sm font-semibold text-rally-600 flex-1" numberOfLines={1}>
                  {teamConfig.rally_forward_address}
                </Text>
                <Pressable
                  onPress={async () => {
                    await Clipboard.setStringAsync(teamConfig.rally_forward_address);
                    tapLight();
                    Alert.alert('Copied', 'Forward address copied to clipboard.');
                  }}
                  className="bg-rally-600 px-3 py-1.5 rounded-lg active:opacity-80 ml-2"
                >
                  <Text className="text-xs font-semibold text-cream">Copy</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
