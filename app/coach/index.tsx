import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Image, ActivityIndicator, Platform, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tapLight } from '@/lib/haptics';
import { useAuth } from '@/providers/AuthProvider';
import { useCoachStore } from '@/stores/useCoachStore';
import { fetchMyCoach, fetchFacilities, fetchPendingRequests, isSupabaseConfigured } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';

export default function CoachDashboardScreen() {
  const { user, signOut } = useAuth();
  const ic = useIconColors();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const setCoachProfile = useCoachStore((s) => s.setCoachProfile);
  const [loading, setLoading] = useState(!coachProfile);
  const [facilityCount, setFacilityCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Refresh on every visit so the count drops right after approving/declining.
  useFocusEffect(useCallback(() => {
    let active = true;
    if (coachProfile && isSupabaseConfigured) {
      fetchPendingRequests(coachProfile.id).then(({ data }) => { if (active) setPendingCount(data.length); });
    }
    return () => { active = false; };
  }, [coachProfile]));

  useEffect(() => {
    let active = true;
    (async () => {
      if (coachProfile || !isSupabaseConfigured || !user) { setLoading(false); return; }
      const { data } = await fetchMyCoach(user.id);
      if (active) {
        if (data) setCoachProfile(data);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [user, coachProfile]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!coachProfile || !isSupabaseConfigured) return;
      const { data } = await fetchFacilities(coachProfile.id);
      if (active) setFacilityCount(data.length);
    })();
    return () => { active = false; };
  }, [coachProfile]);

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
        {/* Coach accounts land here as their home — nothing to go back to */}
        {router.canGoBack() ? (
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="chevron-back" size={24} color={ic.muted} />
          </Pressable>
        ) : (
          <View className="w-6" />
        )}
        <Text className="text-lg font-bold text-bark dark:text-cream">Coaching</Text>
        {router.canGoBack() ? (
          <View className="w-6" />
        ) : (
          <Pressable onPress={() => signOut()} className="p-1" accessibilityLabel="Sign out">
            <Ionicons name="log-out-outline" size={22} color={ic.muted} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#3B82B0" />
        </View>
      ) : !coachProfile ? (
        // ---- Empty state: no listing yet ----
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }}>
          <View className="items-center">
            <View className="w-16 h-16 rounded-full bg-rally-50 dark:bg-rally-900/20 items-center justify-center mb-4">
              <Ionicons name="clipboard-outline" size={30} color="#3B82B0" />
            </View>
            <Text className="text-xl font-bold text-bark dark:text-cream text-center mb-2">
              Run your private lessons from one place
            </Text>
            <Text className="text-sm text-stone dark:text-parchment text-center mb-6 leading-5">
              Set up a listing, publish your hours, and let families request and pay — no more chasing
              Venmo and texts. Let's fix that.
            </Text>
            <Pressable
              className="bg-rally-600 rounded-xl px-6 py-3.5 active:opacity-80 w-full items-center"
              onPress={() => router.push('/coach/onboarding')}
            >
              <Text className="text-base font-semibold text-cream">Set up my coaching profile</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        // ---- Coach dashboard ----
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Pending requests alert */}
          {pendingCount > 0 && (
            <Pressable
              onPress={() => { tapLight(); router.push('/coach/requests'); }}
              className="rounded-2xl p-4 mb-4 flex-row items-center active:opacity-80"
              style={{ backgroundColor: '#d97706', shadowColor: '#d97706', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 }}
            >
              <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                <Ionicons name="notifications" size={20} color="#fff" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-white">
                  {pendingCount} lesson request{pendingCount === 1 ? '' : 's'} waiting
                </Text>
                <Text className="text-xs text-white/90 mt-0.5">Tap to review and approve or decline</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </Pressable>
          )}

          {/* Listing summary card */}
          <View
            className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 border border-parchment dark:border-rally-900 mb-4"
            style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
          >
            <View className="flex-row items-center mb-2">
              <View className="w-12 h-12 rounded-full bg-cream dark:bg-bark border border-parchment dark:border-rally-900 items-center justify-center overflow-hidden mr-3">
                {coachProfile.photo_url ? (
                  <Image source={{ uri: coachProfile.photo_url }} className="w-12 h-12" resizeMode="cover" />
                ) : (
                  <Ionicons name="person" size={22} color={ic.placeholder} />
                )}
              </View>
              <Text className="text-lg font-bold text-bark dark:text-cream flex-1 mr-2">
                {coachProfile.display_name}
              </Text>
              <View className={`px-2.5 py-1 rounded-full ${coachProfile.visibility === 'public' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-parchment dark:bg-rally-900/30'}`}>
                <Text className={`text-xs font-semibold ${coachProfile.visibility === 'public' ? 'text-green-700 dark:text-green-300' : 'text-stone dark:text-parchment'}`}>
                  {coachProfile.visibility === 'public' ? 'Public' : 'Private'}
                </Text>
              </View>
            </View>

            {!!coachProfile.bio && (
              <Text className="text-sm text-stone dark:text-parchment mb-3" numberOfLines={3}>
                {coachProfile.bio}
              </Text>
            )}

            <View className="flex-row flex-wrap gap-2 mb-3">
              {coachProfile.cost_tier && (
                <View className="bg-rally-50 dark:bg-rally-900/20 px-2.5 py-1 rounded-lg">
                  <Text className="text-xs font-semibold text-rally-600">{coachProfile.cost_tier}</Text>
                </View>
              )}
              {coachProfile.specialties.map((s) => (
                <View key={s} className="bg-cream dark:bg-bark px-2.5 py-1 rounded-lg">
                  <Text className="text-xs text-bark dark:text-parchment">{s}</Text>
                </View>
              ))}
            </View>

            <Pressable
              className="flex-row items-center justify-center border border-rally-600 rounded-xl py-2.5 active:opacity-70"
              onPress={() => router.push('/coach/listing-edit')}
            >
              <Ionicons name="create-outline" size={16} color="#3B82B0" />
              <Text className="text-sm font-semibold text-rally-600 ml-2">Edit listing</Text>
            </Pressable>
          </View>

          {/* Share code — clients enter this to connect & book */}
          {!!coachProfile.invite_code && (
            <View className="bg-warm-white dark:bg-bark-light rounded-2xl p-4 border border-parchment dark:border-rally-900 mb-4">
              <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-1">Your client code</Text>
              <Text className="text-xs text-stone dark:text-parchment mb-2">Share this so families can connect and book with you.</Text>
              <View className="flex-row items-center">
                <View className="flex-1 bg-rally-50 dark:bg-rally-900/20 rounded-lg px-3 py-2.5">
                  <Text className="text-base font-bold tracking-widest text-rally-600">{coachProfile.invite_code}</Text>
                </View>
                <Pressable
                  className="bg-rally-600 px-4 py-2.5 rounded-lg active:opacity-80 ml-2"
                  onPress={async () => {
                    await Clipboard.setStringAsync(coachProfile.invite_code!);
                    tapLight();
                    Platform.OS === 'web' ? window.alert('Code copied') : Alert.alert('Copied', 'Client code copied.');
                  }}
                >
                  <Text className="text-sm font-semibold text-cream">Copy</Text>
                </Pressable>
              </View>

              <Pressable
                className="flex-row items-center justify-center bg-rally-600 rounded-xl py-2.5 mt-3 active:opacity-80"
                onPress={async () => {
                  const code = coachProfile.invite_code!;
                  const link = 'https://rally-hub.com';
                  const message =
                    `${coachProfile.display_name} invited you to book volleyball lessons on RALLY! 🏐\n\n` +
                    `1) Sign up: ${link}\n` +
                    `2) Open the Hub tab → "My Coaches"\n` +
                    `3) Enter code: ${code}`;
                  tapLight();
                  try {
                    if (Platform.OS === 'web') {
                      await Clipboard.setStringAsync(message);
                      window.alert('Invite copied — paste it into a text to your client.');
                    } else {
                      await Share.share({ message });
                    }
                  } catch { /* user dismissed */ }
                }}
              >
                <Ionicons name="share-outline" size={16} color="#fff" />
                <Text className="text-sm font-semibold text-cream ml-2">Invite a client by text</Text>
              </Pressable>
            </View>
          )}

          {coachProfile.visibility === 'public' && !coachProfile.identity_verified && (
            <View className="bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3 mb-4 flex-row items-start">
              <Ionicons name="alert-circle" size={18} color="#B8924A" style={{ marginTop: 1 }} />
              <Text className="text-xs text-amber-700 dark:text-amber-300 ml-2 flex-1">
                Your public listing isn't live yet — finish identity + SafeSport verification to start taking new families.
              </Text>
            </View>
          )}

          {/* Next-step tiles */}
          <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2 ml-1">Your business</Text>
          <DashRow
            icon="today-outline"
            color="#3B82B0"
            title="Schedule"
            subtitle="This week's lessons · sync to Google Calendar"
            onPress={() => router.push('/coach/schedule')}
          />
          <DashRow
            icon="business-outline"
            color="#0d9488"
            title="Facilities"
            subtitle={facilityCount === null ? 'Gyms you coach at' : facilityCount === 0 ? 'Add the gyms you coach at' : `${facilityCount} facilit${facilityCount === 1 ? 'y' : 'ies'}`}
            onPress={() => router.push('/coach/facilities')}
          />
          <DashRow
            icon="pricetags-outline"
            color="#7c3aed"
            title="Session types & pricing"
            subtitle="Define your lessons"
            onPress={() => router.push('/coach/session-types')}
          />
          <DashRow
            icon="calendar-outline"
            color="#6A9E8A"
            title="Availability"
            subtitle="Publish your open hours per facility"
            onPress={() => router.push('/coach/availability')}
          />
          <DashRow
            icon="people-circle-outline"
            color="#ca8a04"
            title="Client groups"
            subtitle="Segments for targeted availability"
            onPress={() => router.push('/coach/segments')}
          />
          <DashRow
            icon="people-outline"
            color="#d97706"
            title="Requests"
            subtitle={pendingCount ? `${pendingCount} waiting for your reply` : 'Review & accept lesson requests'}
            badge={pendingCount}
            onPress={() => router.push('/coach/requests')}
          />
          <DashRow icon="cash-outline" color="#16a34a" title="Earnings" subtitle="Payouts & history" comingSoon />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function DashRow({ icon, color = '#3B82B0', title, subtitle, badge, comingSoon, onPress }: { icon: keyof typeof Ionicons.glyphMap; color?: string; title: string; subtitle: string; badge?: number; comingSoon?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2 flex-row items-center active:opacity-80"
      style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
    >
      <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: color + '15' }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-bark dark:text-cream">{title}</Text>
        <Text className="text-xs text-stone dark:text-parchment mt-0.5">{subtitle}</Text>
      </View>
      {badge ? (
        <View className="min-w-[22px] h-[22px] px-1.5 rounded-full items-center justify-center mr-2" style={{ backgroundColor: '#dc2626' }}>
          <Text className="text-xs font-bold text-white">{badge}</Text>
        </View>
      ) : null}
      {comingSoon ? (
        <View className="bg-parchment dark:bg-rally-900/30 px-2 py-1 rounded-md">
          <Text className="text-[10px] font-bold text-stone dark:text-parchment">SOON</Text>
        </View>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
      ) : null}
    </Pressable>
  );
}
