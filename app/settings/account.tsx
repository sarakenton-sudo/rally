import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useIconColors } from '@/lib/colors';
import { supabase } from '@/lib/supabase';
import type { HouseholdMember, HouseholdInvite } from '@/types/database';

export default function AccountScreen() {
  const ic = useIconColors();
  const { user, signOut } = useAuth();
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invites, setInvites] = useState<HouseholdInvite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHousehold();
  }, []);

  const loadHousehold = async () => {
    setLoading(true);
    const [membersRes, invitesRes] = await Promise.all([
      supabase.from('household_members').select('*').or(`owner_user_id.eq.${user?.id},member_user_id.eq.${user?.id}`),
      supabase.from('household_invites').select('*').eq('owner_user_id', user?.id ?? '').eq('status', 'pending'),
    ]);
    if (membersRes.data) setMembers(membersRes.data as HouseholdMember[]);
    if (invitesRes.data) setInvites(invitesRes.data as HouseholdInvite[]);
    setLoading(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleRevokeMember = (member: HouseholdMember) => {
    Alert.alert('Remove Co-Parent', 'They will lose access to your data.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('household_members').delete().eq('id', member.id);
          loadHousehold();
        },
      },
    ]);
  };

  const handleRevokeInvite = async (invite: HouseholdInvite) => {
    await (supabase.from('household_invites') as any).update({ status: 'revoked' }).eq('id', invite.id);
    loadHousehold();
  };

  // Is the current user the admin (owner) or a co-parent (member)?
  const isOwner = members.length === 0 || members.some((m) => m.owner_user_id === user?.id);
  const linkedOwner = members.find((m) => m.member_user_id === user?.id);

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

        {/* Change Password */}
        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-3 flex-row items-center active:opacity-80"
          onPress={() => router.push('/settings/change-password')}
        >
          <Ionicons name="lock-closed-outline" size={20} color={ic.muted} />
          <Text className="text-sm font-semibold text-bark dark:text-cream ml-3 flex-1">Change Password</Text>
          <Ionicons name="chevron-forward" size={18} color={ic.subtle} />
        </Pressable>

        {/* Co-Parent Section */}
        <View className="mt-6 mb-3">
          <View className="flex-row items-center">
            <Ionicons name="people" size={16} color={ic.muted} />
            <Text className="text-sm font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
              Co-Parent Sharing
            </Text>
          </View>
        </View>

        {linkedOwner && (
          <View className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 border border-rally-200 dark:border-rally-800 mb-3">
            <Text className="text-xs text-stone uppercase tracking-wider mb-1">Linked to</Text>
            <Text className="text-sm text-bark dark:text-cream font-semibold">
              Owner account
            </Text>
            <Text className="text-xs text-stone mt-1">
              You have co-parent access. You can view and edit, but not delete data.
            </Text>
          </View>
        )}

        {isOwner && (
          <>
            {/* Linked co-parents */}
            {members.filter((m) => m.owner_user_id === user?.id).map((member) => (
              <View
                key={member.id}
                className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2 flex-row items-center"
              >
                <Ionicons name="person-circle-outline" size={24} color="#6A9E8A" />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-semibold text-bark dark:text-cream">Co-Parent Linked</Text>
                  <Text className="text-xs text-stone mt-0.5">Role: {member.role}</Text>
                </View>
                <Pressable
                  onPress={() => handleRevokeMember(member)}
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
                    <Text className="text-xs text-stone mt-0.5">Invite pending</Text>
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
              <Text className="text-sm font-semibold text-cream">Invite Co-Parent</Text>
            </Pressable>
          </>
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
