import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useIconColors } from '@/lib/colors';
import { supabase } from '@/lib/supabase';
import { useSeasonStore } from '@/stores/useSeasonStore';
import type { AdminAthlete, AthleteInvite, Athlete } from '@/types/database';

export default function AccountScreen() {
  const ic = useIconColors();
  const { user, userProfile } = useAuth();
  const { signOut } = useAuth();
  const adminAthletes = useSeasonStore((s) => s.adminAthletes);
  const athletes = useSeasonStore((s) => s.athletes);
  const [linkedAdmins, setLinkedAdmins] = useState<AdminAthlete[]>([]);
  const [invites, setInvites] = useState<AthleteInvite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSharing();
  }, []);

  const loadSharing = async () => {
    setLoading(true);

    // Load admin_athletes for athletes this user manages (to see other admins)
    const myAthleteIds = adminAthletes
      .filter((aa) => aa.admin_id === user?.id && aa.is_primary)
      .map((aa) => aa.athlete_id);

    if (myAthleteIds.length > 0) {
      // Get other admins linked to our athletes
      const { data: otherAdmins } = await supabase
        .from('admin_athletes')
        .select('*')
        .in('athlete_id', myAthleteIds)
        .neq('admin_id', user?.id ?? '');
      if (otherAdmins) setLinkedAdmins(otherAdmins as AdminAthlete[]);

      // Get pending invites we've sent
      const { data: pendingInvites } = await supabase
        .from('athlete_invites')
        .select('*')
        .eq('inviter_id', user?.id ?? '')
        .eq('status', 'pending');
      if (pendingInvites) setInvites(pendingInvites as AthleteInvite[]);
    }

    setLoading(false);
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) {
        signOut();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
      ]);
    }
  };

  const handleRemoveAdmin = (aa: AdminAthlete) => {
    const athlete = athletes.find((a) => a.id === aa.athlete_id);
    Alert.alert('Remove Linked Admin', `They will lose access to ${athlete?.first_name ?? 'this athlete'}'s data.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('admin_athletes').delete().eq('id', aa.id);
          loadSharing();
        },
      },
    ]);
  };

  const handleRevokeInvite = async (invite: AthleteInvite) => {
    await (supabase.from('athlete_invites') as any).update({ status: 'revoked' }).eq('id', invite.id);
    loadSharing();
  };

  const isAdmin = userProfile?.role === 'admin';
  const isPrimaryAdmin = adminAthletes.some((aa) => aa.admin_id === user?.id && aa.is_primary);

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Account</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Email */}
        <View className="bg-cream dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-3">
          <Text className="text-xs text-stone uppercase tracking-wider mb-1">Email</Text>
          <Text className="text-base text-bark dark:text-cream font-semibold">
            {user?.email ?? '—'}
          </Text>
        </View>

        {/* Role badge */}
        <View className="bg-cream dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-3">
          <Text className="text-xs text-stone uppercase tracking-wider mb-1">Role</Text>
          <Text className="text-base text-bark dark:text-cream font-semibold capitalize">
            {userProfile?.role ?? 'admin'}
          </Text>
          {userProfile?.role === 'athlete' && (
            <Text className="text-xs text-stone mt-1">
              You have athlete access. View your schedule and team info.
            </Text>
          )}
        </View>

        {/* Change Password */}
        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-3 flex-row items-center active:opacity-80"
          onPress={() => router.push('/settings/change-password')}
        >
          <Ionicons name="lock-closed-outline" size={20} color={ic.muted} />
          <Text className="text-sm font-semibold text-bark dark:text-cream ml-3 flex-1">Change Password</Text>
          <Ionicons name="chevron-forward" size={18} color={ic.subtle} />
        </Pressable>

        {/* Sharing Section (admin only) */}
        {isAdmin && isPrimaryAdmin && (
          <>
            <View className="mt-6 mb-3">
              <View className="flex-row items-center">
                <Ionicons name="people" size={16} color={ic.muted} />
                <Text className="text-sm font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
                  Shared Access
                </Text>
              </View>
            </View>

            {/* Linked admins (co-parents who accepted invites) */}
            {linkedAdmins.map((aa) => (
              <View
                key={aa.id}
                className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2 flex-row items-center"
              >
                <Ionicons name="person-circle-outline" size={24} color="#6A9E8A" />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-semibold text-bark dark:text-cream">Linked Admin</Text>
                  <Text className="text-xs text-stone mt-0.5">Permission: {aa.permission}</Text>
                </View>
                <Pressable
                  onPress={() => handleRemoveAdmin(aa)}
                  className="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 active:opacity-70"
                >
                  <Text className="text-xs font-semibold text-red-600">Remove</Text>
                </Pressable>
              </View>
            ))}

            {/* Pending invites */}
            {invites.map((invite) => (
              <View
                key={invite.id}
                className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800 mb-2"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-bark dark:text-cream">{invite.email}</Text>
                    <Text className="text-xs text-stone mt-0.5">
                      {invite.invite_type === 'athlete' ? 'Athlete invite' : 'Admin invite'} pending
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleRevokeInvite(invite)}
                    className="px-3 py-1.5 rounded-lg bg-red-50 active:opacity-70"
                  >
                    <Text className="text-xs font-semibold text-red-600">Revoke</Text>
                  </Pressable>
                </View>
              </View>
            ))}

            {/* Invite button */}
            <Pressable
              className="bg-rally-600 rounded-xl py-3.5 items-center mt-1 active:opacity-80"
              onPress={() => router.push('/settings/invite-coparent')}
            >
              <Text className="text-sm font-semibold text-cream">Invite Admin or Athlete</Text>
            </Pressable>
          </>
        )}

        {/* Non-primary admin info */}
        {isAdmin && !isPrimaryAdmin && adminAthletes.length > 0 && (
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 border border-rally-200 dark:border-rally-800 mt-6 mb-3">
            <Text className="text-xs text-stone uppercase tracking-wider mb-1">Linked to</Text>
            <Text className="text-sm text-bark dark:text-cream font-semibold">
              Shared athlete access
            </Text>
            <Text className="text-xs text-stone mt-1">
              You have {adminAthletes[0]?.permission ?? 'view'} access to this athlete's data.
            </Text>
          </View>
        )}

        {/* Sign Out */}
        <Pressable
          className="bg-red-50 dark:bg-red-900/20 rounded-xl py-3.5 items-center mt-8 active:opacity-80 border border-red-200 dark:border-red-800"
          onPress={handleSignOut}
        >
          <Text className="text-sm font-semibold text-red-600">Sign Out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
