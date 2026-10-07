import { View, Text, ScrollView, RefreshControl, Pressable, Alert, Linking, Switch } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import HubSectionHeader from '@/components/HubSectionHeader';
import HubSettingsRow from '@/components/HubSettingsRow';
import FeatureRequest from '@/components/FeatureRequest';
import { PAYMENTS_ENABLED } from '@/lib/config';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import { openDeepLink } from '@/lib/deepLink';
import ReferFriend from '@/components/ReferFriend';
import AthleteCredentialCard from '@/components/AthleteCredentialCard';

export default function HubScreen() {
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const forwardedEmails = useSeasonStore((s) => s.forwardedEmails);
  const hideTravelCosts = useSeasonStore((s) => s.hideTravelCosts);
  const setHideTravelCosts = useSeasonStore((s) => s.setHideTravelCosts);
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

        {PAYMENTS_ENABLED && (
        <HubSettingsRow
          icon="card"
          iconColor="#16a34a"
          title="Payments"
          subtitle="Bank account or card for lessons, and payment history"
          onPress={() => router.push('/settings/payments')}
        />
        )}

        {/* ============================================================ */}
        {/* COACHING */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader icon="clipboard" title="Coaching" iconColor={ic.muted} />
        </View>

        <HubSettingsRow
          icon="people"
          iconColor="#3B82B0"
          title="My Coaches"
          subtitle="Book private lessons — connect with a code, request times"
          onPress={() => router.push('/coaching')}
        />

        <HubSettingsRow
          icon="megaphone"
          iconColor="#6A9E8A"
          title="Coach Mode"
          subtitle="Run your private lessons — listing, availability & bookings"
          onPress={() => router.replace('/today')}
        />

        {/* ============================================================ */}
        {/* TRAVEL IMPORT */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader icon="airplane" title="Tournament & Travel Details Import" iconColor={ic.muted} />
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
          subtitle="Add tournaments, hotels, flights and events"
          onPress={() => router.push('/settings/schedule-import')}
        />

        {/* Email Inbox */}
        <HubSettingsRow
          icon="mail-unread"
          iconColor="#3B82B0"
          title="Email Inbox"
          subtitle="Confirmations you forward to plans@rally-hub.com"
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



        {/* ============================================================ */}
        {/* PREFERENCES */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader icon="options" title="Preferences" iconColor={ic.muted} />
        </View>

        <View
          className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2 flex-row items-center justify-between"
          style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
        >
          <View className="flex-row items-center flex-1 mr-3">
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: 'rgba(106,158,138,0.15)' }}>
              <Ionicons name="eye-off" size={16} color="#6A9E8A" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-bark dark:text-cream">Hide Travel Costs</Text>
              <Text className="text-xs text-stone dark:text-parchment mt-0.5">For my mental health</Text>
            </View>
          </View>
          <Switch
            value={hideTravelCosts}
            onValueChange={(val) => { setHideTravelCosts(val); tapLight(); }}
            trackColor={{ false: '#D8E2EC', true: '#6A9E8A' }}
            thumbColor="#FEFEFE"
          />
        </View>

        {/* ============================================================ */}
        {/* GUEST MANAGEMENT */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader icon="people" title="Fans" iconColor={ic.muted} />
        </View>

        <HubSettingsRow
          icon="people"
          iconColor="#6A9E8A"
          title="Fans"
          subtitle="Invite grandparents, family and friends to follow along"
          onPress={() => router.push('/fans')}
        />

        {/* Logins moved to the Family tab (family) and athlete pages (1:1). */}
        <View className="mt-6">
          <HubSectionHeader icon="key" title="Logins & codes" iconColor={ic.muted} />
        </View>
        <HubSettingsRow
          icon="key"
          iconColor="#ca8a04"
          title="Family logins"
          subtitle={`${configuredAdminLinks.length} saved · GroupMe, LeagueApps, AES and more`}
          onPress={() => router.navigate({ pathname: '/(tabs)/family', params: { focus: 'logins' } })}
        />

        {/* ============================================================ */}
        {/* HELP & FEEDBACK */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader icon="bulb" title="Help & feedback" iconColor={ic.muted} />
        </View>
        <FeatureRequest />
        <HubSettingsRow
          icon="help-circle"
          iconColor="#3B82B0"
          title="Need help?"
          subtitle="Email hello@rally-hub.com"
          onPress={() => Linking.openURL('mailto:hello@rally-hub.com')}
        />

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

        <ReferFriend />
      </ScrollView>
    </View>
  );
}
