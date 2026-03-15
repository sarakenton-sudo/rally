import { View, Text, ScrollView, RefreshControl, Pressable, Alert, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import HubSectionHeader from '@/components/HubSectionHeader';
import HubSettingsRow from '@/components/HubSettingsRow';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import { openDeepLink } from '@/lib/deepLink';

export default function HubScreen() {
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const forwardedEmails = useSeasonStore((s) => s.forwardedEmails);
  const ic = useIconColors();
  const { refresh, isRefreshing } = useDataRefresh();
  const externalLinks = adminConfig?.external_links ?? [];

  // Admin-scoped links only (exclude athlete-scoped)
  const adminLinks = externalLinks.filter((l) => {
    if (l.scope === 'athlete') return false;
    if (!l.scope) {
      const lower = l.label.toLowerCase();
      if (['sportsrecruits', 'university athlete', 'hudl'].some((k) => lower.includes(k))) return false;
    }
    return true;
  });
  const configuredAdminLinks = adminLinks.filter((l) => l.url);
  const unconfiguredAdminLinks = adminLinks.filter((l) => !l.url);

  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3B82B0" />}
      >
        <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold">
          Settings
        </Text>
        <Text className="text-sm text-stone dark:text-parchment mt-1 mb-6">
          Account, travel import & notifications
        </Text>

        {/* ============================================================ */}
        {/* ACCOUNT */}
        {/* ============================================================ */}
        <HubSectionHeader icon="person-circle" title="Account" iconColor={ic.muted} />

        <HubSettingsRow
          icon="person"
          iconColor="#3B82B0"
          title="Account & Co-Parent"
          subtitle="Sign out, change password, invite co-parent"
          onPress={() => router.push('/settings/account')}
        />

        {/* ============================================================ */}
        {/* TRAVEL IMPORT */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader icon="airplane" title="Travel Import" iconColor={ic.muted} />
        </View>

        {/* Email Forwarding */}
        <View
          className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2"
          style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
        >
          <Pressable className="flex-row items-center mb-2" onPress={() => router.push('/settings/email-forward')}>
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#3B82B015' }}>
              <Ionicons name="mail-open" size={16} color="#3B82B0" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-bark dark:text-cream">Email Forwarding</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                <View style={{ backgroundColor: 'rgba(251,146,60,0.2)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#FB923C' }}>Email Auto-Sync coming soon!</Text>
                </View>
              </View>
              <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                Forward travel & tournament emails to RALLY
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
          </Pressable>
          {adminConfig?.rally_forward_address && (
            <View className="bg-rally-50 dark:bg-rally-900/20 rounded-lg p-3 ml-11 flex-row items-center">
              <Text className="text-sm font-semibold text-rally-600 flex-1" numberOfLines={1}>
                {adminConfig.rally_forward_address}
              </Text>
              <Pressable
                onPress={async () => {
                  await Clipboard.setStringAsync(adminConfig.rally_forward_address);
                  tapLight();
                  Alert.alert('Copied', 'Forward address copied to clipboard.');
                }}
                className="bg-rally-600 px-3 py-1.5 rounded-lg active:opacity-80 ml-2"
              >
                <Text className="text-xs font-semibold text-cream">Copy</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* My Email Addresses */}
        <HubSettingsRow
          icon="mail"
          iconColor="#6A9E8A"
          title="My Email Addresses"
          subtitle="Add emails you use to book travel so RALLY recognizes them"
          badge={adminConfig?.trusted_sender_emails?.length || undefined}
          onPress={() => router.push('/settings/trusted-emails')}
        />

        {/* Copy / Paste + AI */}
        <HubSettingsRow
          icon="sparkles"
          iconColor="#7c3aed"
          title="Copy / Paste + AI"
          subtitle="Paste a confirmation and AI will extract travel details"
          onPress={() => router.push('/import/paste-travel')}
        />

        {/* Manual Entry */}
        <HubSettingsRow
          icon="add-circle"
          iconColor="#6A9E8A"
          title="Add Tournament & Travel Details"
          subtitle="Add tournaments, hotels, flights, events, and guests"
          onPress={() => router.push('/settings/schedule-import')}
        />

        {/* Email Inbox */}
        <HubSettingsRow
          icon="mail-unread"
          iconColor="#3B82B0"
          title="Email Inbox"
          subtitle="Emails synced from Gmail & forwarded to Rally"
          badge={forwardedEmails.length}
          onPress={() => router.push('/email/inbox')}
        />

        {/* ============================================================ */}
        {/* NOTIFICATIONS */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader icon="notifications" title="Notifications" iconColor={ic.muted} />
        </View>

        <HubSettingsRow
          icon="notifications-outline"
          iconColor="#3B82B0"
          title="Notification Preferences"
          subtitle="Manage push notification categories"
          onPress={() => router.push('/settings/notifications')}
        />

        {/* VIP Alerts — Coming Soon */}
        <HubSettingsRow
          icon="star"
          iconColor="#6A9E8A"
          title="VIP Email Alerts"
          subtitle="Coach & club email senders that trigger push notifications"
          comingSoon
          onPress={() => Alert.alert('Coming Soon', 'VIP push notifications will be available in a future release.')}
        />

        {/* Email Auto-Sync — Coming Soon */}
        <HubSettingsRow
          icon="sync"
          iconColor="#7c3aed"
          title="Email Auto-Sync"
          subtitle="Automatically sync travel emails from Gmail"
          comingSoon
          onPress={() => Alert.alert('Coming Soon', 'Automatic Gmail sync will be available in a future release.')}
        />

        {/* ============================================================ */}
        {/* GUEST MANAGEMENT */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader icon="people" title="Guests" iconColor={ic.muted} />
        </View>

        <HubSettingsRow
          icon="people"
          iconColor="#6A9E8A"
          title="Guest Management"
          subtitle="Manage grandparents, family, and other guests"
          onPress={() => router.push('/(tabs)/guests')}
        />

        {/* ============================================================ */}
        {/* QUICK LINKS (admin-scoped) */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader
            icon="link"
            title="Quick Links & Credential Vault"
            iconColor={ic.muted}
            subtitle="GroupMe, LeagueApps, SportsEngine, and other team tools"
            action={{ label: 'Add', onPress: () => router.push('/profile/edit-link') }}
          />
        </View>

        <View className="flex-row flex-wrap gap-3 mb-4">
          {configuredAdminLinks.map((link, i) => {
            const originalIndex = externalLinks.indexOf(link);
            const hasCredentials = !!(link.username || link.password);
            return (
              <View
                key={`${link.label}-${i}`}
                className="bg-warm-white dark:bg-bark-light rounded-xl border border-parchment dark:border-rally-900 overflow-hidden"
                style={{ width: '47%', shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
              >
                <Pressable
                  className="items-center pt-4 pb-2 px-4 active:opacity-70"
                  onPress={() => openDeepLink(link)}
                >
                  <View>
                    <Ionicons
                      name={link.icon_name as keyof typeof Ionicons.glyphMap}
                      size={28}
                      color="#3B82B0"
                    />
                    {hasCredentials && (
                      <View className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 border border-warm-white dark:border-bark-light" />
                    )}
                  </View>
                  <Text className="text-sm font-medium text-bark dark:text-parchment mt-2 text-center">
                    {link.label}
                  </Text>
                </Pressable>
                {hasCredentials ? (
                  <View className="flex-row border-t border-parchment dark:border-rally-900 bg-green-50 dark:bg-green-900/20">
                    {link.username ? (
                      <Pressable
                        className="flex-1 flex-row items-center justify-center py-2 active:opacity-60"
                        onPress={async () => {
                          await Clipboard.setStringAsync(link.username!);
                          tapLight();
                          Alert.alert('Copied', 'Username copied.');
                        }}
                      >
                        <Ionicons name="person-outline" size={12} color="#6A9E8A" />
                        <Text className="text-xs font-semibold ml-1" style={{ color: '#6A9E8A' }}>Copy ID</Text>
                      </Pressable>
                    ) : null}
                    {link.username && link.password ? (
                      <View className="w-px bg-parchment dark:bg-rally-900" />
                    ) : null}
                    {link.password ? (
                      <Pressable
                        className="flex-1 flex-row items-center justify-center py-2 active:opacity-60"
                        onPress={async () => {
                          await Clipboard.setStringAsync(link.password!);
                          tapLight();
                          Alert.alert('Copied', 'Password copied.');
                        }}
                      >
                        <Ionicons name="key-outline" size={12} color="#6A9E8A" />
                        <Text className="text-xs font-semibold ml-1" style={{ color: '#6A9E8A' }}>Copy PW</Text>
                      </Pressable>
                    ) : null}
                    <View className="w-px bg-parchment dark:bg-rally-900" />
                    <Pressable
                      className="px-3 items-center justify-center py-2 active:opacity-60"
                      onPress={() => router.push({ pathname: '/profile/edit-link', params: { index: String(originalIndex) } })}
                    >
                      <Ionicons name="create-outline" size={14} color="#6A9E8A" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    className="py-2 items-center border-t border-parchment dark:border-rally-900 bg-amber-50 dark:bg-amber-900/20 active:opacity-70"
                    onPress={() => router.push({ pathname: '/profile/edit-link', params: { index: String(originalIndex) } })}
                  >
                    <Text className="text-xs font-semibold" style={{ color: '#B8924A' }}>Add Login</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        {/* Unconfigured admin links */}
        {unconfiguredAdminLinks.length > 0 && (
          <>
            <Text className="text-xs text-stone uppercase tracking-wider mb-2 ml-1">
              Not configured
            </Text>
            <View className="flex-row flex-wrap gap-3 mb-6">
              {unconfiguredAdminLinks.map((link, i) => {
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

        {/* ============================================================ */}
        {/* LEGAL */}
        {/* ============================================================ */}
        <View className="mt-6 mb-2">
          <HubSectionHeader icon="document-text" title="Legal" iconColor={ic.muted} />
        </View>

        <HubSettingsRow
          icon="shield-checkmark"
          iconColor="#3B82B0"
          title="Privacy Policy"
          subtitle="How we collect, use, and protect your data"
          onPress={() => Linking.openURL('https://rally-hub.com/privacy')}
        />

        <HubSettingsRow
          icon="document-text"
          iconColor="#3B82B0"
          title="Terms of Use"
          subtitle="Rules and guidelines for using RallyHUB"
          onPress={() => Linking.openURL('https://rally-hub.com/terms')}
        />

        <Text className="text-xs text-stone/50 text-center mt-4 mb-2">
          © 2026 Quiet Standard Consulting LLC
        </Text>
      </ScrollView>
    </View>
  );
}
