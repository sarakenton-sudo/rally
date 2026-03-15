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
import { useSeasonStore } from '@/stores/useSeasonStore';
import { tapLight, notifySuccess } from '@/lib/haptics';
import type { InviteType, AdminPermission } from '@/types/database';

export default function InviteCoParentScreen() {
  const ic = useIconColors();
  const { user } = useAuth();
  const adminAthletes = useSeasonStore((s) => s.adminAthletes);
  const athletes = useSeasonStore((s) => s.athletes);

  const [email, setEmail] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [inviteType, setInviteType] = useState<InviteType>('admin');
  const [permission, setPermission] = useState<AdminPermission>('view');
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(
    athletes.length > 1 ? 'all' : null
  );

  // Get the primary athlete for this admin
  const primaryLink = adminAthletes.find((aa) => aa.admin_id === user?.id && aa.is_primary);

  // Default to primary athlete if none selected (or 'all' for multi-athlete)
  const isAll = selectedAthleteId === 'all';
  const effectiveAthleteId = isAll ? (primaryLink?.athlete_id ?? athletes[0]?.id ?? null) : (selectedAthleteId ?? primaryLink?.athlete_id ?? null);
  const selectedAthlete = isAll ? null : athletes.find((a) => a.id === effectiveAthleteId);

  const handleSendInvite = async () => {
    if (!email.trim()) {
      Alert.alert('Missing field', 'Please enter an email address.');
      return;
    }
    if (!isAll && !effectiveAthleteId) {
      Alert.alert('Error', 'Please select an athlete.');
      return;
    }

    setSending(true);

    // If "All Athletes" is selected, create an invite for each athlete
    const athleteIds = isAll ? athletes.map((a) => a.id) : [effectiveAthleteId!];
    let lastCode = '';
    let firstError = '';

    for (const athId of athleteIds) {
      const { data, error } = await supabase
        .from('athlete_invites')
        .insert({
          inviter_id: user!.id,
          athlete_id: athId,
          email: email.trim().toLowerCase(),
          invite_type: inviteType,
          permission: inviteType === 'athlete' ? 'view' : permission,
        } as any)
        .select()
        .single();
      if (error && !firstError) {
        firstError = error.message;
      } else if (data) {
        lastCode = (data as any).invite_code;
      }
    }
    setSending(false);

    if (firstError && !lastCode) {
      Alert.alert('Error', firstError);
    } else {
      notifySuccess();
      setInviteCode(lastCode);
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    tapLight();
    Alert.alert('Copied', 'Invite code copied to clipboard. Share it with the invitee.');
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
          <Text className="text-lg font-bold text-bark dark:text-cream">Invite</Text>
          <View style={{ width: 32 }} />
        </View>

        <View className="flex-1 px-4 pt-6">
          {!inviteCode ? (
            <>
              <Text className="text-sm text-stone dark:text-parchment mb-4">
                Invite someone to access {isAll ? 'all athletes\'' : (selectedAthlete?.first_name ?? 'your athlete\'s')} data. They'll create their own account and use the invite code to link.
              </Text>

              {/* Athlete selector */}
              {athletes.length > 1 && (
                <>
                  <Text className="text-xs text-stone uppercase tracking-wider font-bold mb-2">Share Access To</Text>
                  <View className="flex-row gap-2 mb-4 flex-wrap">
                    <Pressable
                      className={`py-3 px-4 rounded-xl items-center border ${
                        isAll ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-bark-light'
                      }`}
                      onPress={() => setSelectedAthleteId('all')}
                    >
                      <Text className={`text-sm font-bold ${isAll ? 'text-cream' : 'text-bark dark:text-cream'}`}>
                        All Athletes
                      </Text>
                    </Pressable>
                    {athletes.map((ath) => {
                      const isSelected = !isAll && ath.id === effectiveAthleteId;
                      return (
                        <Pressable
                          key={ath.id}
                          className={`py-3 px-4 rounded-xl items-center border ${
                            isSelected ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-bark-light'
                          }`}
                          onPress={() => setSelectedAthleteId(ath.id)}
                        >
                          <Text className={`text-sm font-bold ${isSelected ? 'text-cream' : 'text-bark dark:text-cream'}`}>
                            {ath.first_name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Invite type toggle */}
              <Text className="text-xs text-stone uppercase tracking-wider font-bold mb-2">Invite Type</Text>
              <View className="flex-row gap-2 mb-4">
                <Pressable
                  className={`flex-1 py-3 rounded-xl items-center border ${
                    inviteType === 'admin' ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-bark-light'
                  }`}
                  onPress={() => setInviteType('admin')}
                >
                  <Text className={`text-sm font-bold ${inviteType === 'admin' ? 'text-cream' : 'text-bark dark:text-cream'}`}>
                    Co-Parent / Admin
                  </Text>
                </Pressable>
                <Pressable
                  className={`flex-1 py-3 rounded-xl items-center border ${
                    inviteType === 'athlete' ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-bark-light'
                  }`}
                  onPress={() => setInviteType('athlete')}
                >
                  <Text className={`text-sm font-bold ${inviteType === 'athlete' ? 'text-cream' : 'text-bark dark:text-cream'}`}>
                    Athlete
                  </Text>
                </Pressable>
              </View>

              {/* Permission toggle (admin only) */}
              {inviteType === 'admin' && (
                <>
                  <Text className="text-xs text-stone uppercase tracking-wider font-bold mb-2">Permission</Text>
                  <View className="flex-row gap-2 mb-4">
                    <Pressable
                      className={`flex-1 py-3 rounded-xl items-center border ${
                        permission === 'view' ? 'bg-rally-100 border-rally-300 dark:bg-rally-900/30 dark:border-rally-700' : 'border-parchment dark:border-bark-light'
                      }`}
                      onPress={() => setPermission('view')}
                    >
                      <Text className={`text-sm font-semibold ${permission === 'view' ? 'text-rally-600' : 'text-bark dark:text-cream'}`}>
                        View Only
                      </Text>
                    </Pressable>
                    <Pressable
                      className={`flex-1 py-3 rounded-xl items-center border ${
                        permission === 'manage' ? 'bg-rally-100 border-rally-300 dark:bg-rally-900/30 dark:border-rally-700' : 'border-parchment dark:border-bark-light'
                      }`}
                      onPress={() => setPermission('manage')}
                    >
                      <Text className={`text-sm font-semibold ${permission === 'manage' ? 'text-rally-600' : 'text-bark dark:text-cream'}`}>
                        Full Access
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}

              {inviteType === 'athlete' && (
                <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-3 mb-4 border border-rally-200 dark:border-rally-800">
                  <Text className="text-xs text-rally-600 dark:text-rally-300">
                    The athlete will get their own login to view their schedule and team info.
                  </Text>
                </View>
              )}

              <FormField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="email@example.com"
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
                  Share this code with the invitee. They'll enter it when creating their account.
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
