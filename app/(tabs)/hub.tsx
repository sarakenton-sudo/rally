import { View, Text, ScrollView, RefreshControl, Pressable, Linking, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import USAVProfileCard from '@/components/USAVProfileCard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useIconColors } from '@/lib/colors';

export default function HubScreen() {
  const usavProfiles = useSeasonStore((s) => s.usavProfiles);
  const teamConfig = useSeasonStore((s) => s.teamConfig);
  const forwardedEmails = useSeasonStore((s) => s.forwardedEmails);
  const ic = useIconColors();
  const { refresh, isRefreshing } = useDataRefresh();
  const externalLinks = teamConfig?.external_links ?? [];

  const configuredLinks = externalLinks.filter((l) => l.url);
  const unconfiguredLinks = externalLinks.filter((l) => !l.url);

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#C4714A" />}
      >
        <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold">
          Hub
        </Text>
        <Text className="text-sm text-stone dark:text-parchment mt-1 mb-6">
          Club tools & profiles
        </Text>

        {/* USAV PROFILES */}
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <Ionicons name="shield-checkmark" size={16} color="#dc2626" />
            <Text className="text-sm font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
              USAV Membership
            </Text>
          </View>
          <Pressable
            className="flex-row items-center active:opacity-70"
            onPress={() => router.push('/profile/add-usav')}
          >
            <Ionicons name="add-circle-outline" size={18} color="#C4714A" />
            <Text className="text-xs font-semibold text-rally-600 ml-1">Add</Text>
          </Pressable>
        </View>

        {usavProfiles.length > 0 ? (
          usavProfiles.map((profile) => (
            <View key={profile.id} className="mb-3">
              <USAVProfileCard
                profile={profile}
                onPress={() => router.push({ pathname: '/profile/add-usav', params: { editId: profile.id } })}
              />
            </View>
          ))
        ) : (
          <Pressable
            className="bg-red-50 dark:bg-red-900/20 rounded-xl p-5 mb-3 border border-dashed border-red-200 dark:border-red-800 items-center active:opacity-80"
            onPress={() => router.push('/profile/add-usav')}
          >
            <Ionicons name="shield-outline" size={28} color="#dc2626" />
            <Text className="text-sm font-semibold text-red-700 dark:text-red-300 mt-2">
              Add USAV Membership
            </Text>
            <Text className="text-xs text-red-500 dark:text-red-400 mt-1 text-center">
              Quick check-in at tournaments with your member ID
            </Text>
          </Pressable>
        )}

        {/* RALLY FORWARD ADDRESS */}
        {teamConfig?.rally_forward_address && (
          <Pressable
            className="bg-rally-50 dark:bg-rally-900/20 rounded-xl p-4 mb-6 mt-3 active:opacity-80"
            onPress={() => router.push('/email/inbox')}
          >
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center">
                <Ionicons name="mail" size={16} color="#C4714A" />
                <Text className="text-xs font-semibold text-rally-700 dark:text-rally-300 ml-1.5 uppercase tracking-wider">
                  Email Forwarding
                </Text>
              </View>
              <View className="flex-row items-center">
                {forwardedEmails.length > 0 && (
                  <View className="bg-rally-600 px-2 py-0.5 rounded-full mr-2">
                    <Text className="text-xs font-bold text-cream">{forwardedEmails.length}</Text>
                  </View>
                )}
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push('/settings/email-monitoring');
                  }}
                  className="p-1 active:opacity-60"
                  hitSlop={8}
                >
                  <Ionicons name="settings-outline" size={16} color="#C4714A" />
                </Pressable>
              </View>
            </View>
            <View className="flex-row items-center">
              <Text className="text-sm font-semibold text-rally-600">
                {teamConfig.rally_forward_address}
              </Text>
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(teamConfig.rally_forward_address!);
                  Alert.alert('Copied', 'Forward address copied to clipboard.');
                }}
                className="ml-2 p-1 active:opacity-60"
                hitSlop={8}
              >
                <Ionicons name="copy-outline" size={14} color="#C4714A" />
              </Pressable>
            </View>
            <Text className="text-xs text-rally-500 dark:text-rally-400 mt-1">
              Forward hotel confirmations & coach emails here for auto-import
            </Text>
          </Pressable>
        )}

        {/* QUICK LINKS — configured */}
        <View className="flex-row items-center justify-between mt-3 mb-3">
          <View className="flex-row items-center">
            <Ionicons name="link" size={16} color={ic.muted} />
            <Text className="text-sm font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
              Quick Links
            </Text>
          </View>
          <Pressable
            className="flex-row items-center active:opacity-70"
            onPress={() => router.push('/profile/edit-link')}
          >
            <Ionicons name="add-circle-outline" size={18} color="#C4714A" />
            <Text className="text-xs font-semibold text-rally-600 ml-1">Add</Text>
          </Pressable>
        </View>

        <View className="flex-row flex-wrap gap-3 mb-4">
          {configuredLinks.map((link, i) => {
            const originalIndex = externalLinks.indexOf(link);
            return (
              <Pressable
                key={`${link.label}-${i}`}
                className="bg-warm-white dark:bg-bark-light rounded-xl p-4 items-center justify-center border border-parchment dark:border-rally-900 active:opacity-70"
                style={{ width: '47%' }}
                onPress={() => Linking.openURL(link.url)}
                onLongPress={() => router.push({ pathname: '/profile/edit-link', params: { index: String(originalIndex) } })}
              >
                <Ionicons
                  name={link.icon_name as keyof typeof Ionicons.glyphMap}
                  size={28}
                  color="#C4714A"
                />
                <Text className="text-sm font-medium text-bark dark:text-parchment mt-2 text-center">
                  {link.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Unconfigured links */}
        {unconfiguredLinks.length > 0 && (
          <>
            <Text className="text-xs text-stone uppercase tracking-wider mb-2 ml-1">
              Not configured
            </Text>
            <View className="flex-row flex-wrap gap-3 mb-6">
              {unconfiguredLinks.map((link, i) => {
                const originalIndex = externalLinks.indexOf(link);
                return (
                  <Pressable
                    key={`${link.label}-${i}`}
                    className="bg-cream dark:bg-bark-light/50 rounded-xl p-4 items-center justify-center border border-dashed border-parchment dark:border-rally-900 active:opacity-70"
                    style={{ width: '47%' }}
                    onPress={() => router.push({ pathname: '/profile/edit-link', params: { index: String(originalIndex) } })}
                  >
                    <Ionicons
                      name={link.icon_name as keyof typeof Ionicons.glyphMap}
                      size={28}
                      color={ic.placeholder}
                    />
                    <Text className="text-sm font-medium text-stone mt-2 text-center">
                      {link.label}
                    </Text>
                    <Text className="text-xs text-parchment mt-0.5">Tap to set up</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* TEAM INFO */}
        {teamConfig && (
          <>
            <View className="flex-row items-center mt-3 mb-3">
              <Ionicons name="information-circle" size={16} color={ic.muted} />
              <Text className="text-sm font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
                Team Info
              </Text>
            </View>
            <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900">
              <InfoRow label="Team" value={teamConfig.team_name} />
              <InfoRow label="Season" value={teamConfig.season_year} />
              {teamConfig.team_code && (
                <InfoRow label="Team Code" value={teamConfig.team_code} copyable />
              )}
              {teamConfig.club_email_domain && <InfoRow label="Club Domain" value={teamConfig.club_email_domain} />}
            </View>
          </>
        )}

        {/* SETTINGS */}
        <View className="flex-row items-center mt-6 mb-3">
          <Ionicons name="settings" size={16} color={ic.muted} />
          <Text className="text-sm font-semibold text-stone dark:text-parchment ml-1.5 uppercase tracking-wider">
            Settings
          </Text>
        </View>
        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
          onPress={() => router.push('/settings/notifications')}
        >
          <Ionicons name="notifications-outline" size={22} color="#C4714A" />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-semibold text-bark dark:text-cream">Notification Preferences</Text>
            <Text className="text-xs text-stone mt-0.5">Manage push notification categories</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={ic.subtle} />
        </Pressable>
        <Pressable
          className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900 flex-row items-center active:opacity-80"
          onPress={() => router.push('/settings/email-monitoring')}
        >
          <Ionicons name="mail-outline" size={22} color="#C4714A" />
          <View className="ml-3 flex-1">
            <Text className="text-sm font-semibold text-bark dark:text-cream">Email Monitoring</Text>
            <Text className="text-xs text-stone mt-0.5">Manage trusted & VIP sender emails</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={ic.subtle} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  const handleCopy = async () => {
    await Clipboard.setStringAsync(value);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  };

  return (
    <View className="flex-row items-center justify-between py-2 border-b border-cream dark:border-rally-900 last:border-b-0">
      <Text className="text-sm text-stone dark:text-parchment">{label}</Text>
      <View className="flex-row items-center">
        <Text className="text-sm font-semibold text-bark dark:text-cream">{value}</Text>
        {copyable && (
          <Pressable onPress={handleCopy} className="ml-2 p-1 active:opacity-60">
            <Ionicons name="copy-outline" size={14} color="#9E8E7E" />
          </Pressable>
        )}
      </View>
    </View>
  );
}
