import { View, Text, ScrollView, RefreshControl, Pressable, Linking, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import USAVProfileCard from '@/components/USAVProfileCard';
import HubSectionHeader from '@/components/HubSectionHeader';
import HubSettingsRow from '@/components/HubSettingsRow';
import HubScopeDivider from '@/components/HubScopeDivider';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useIconColors } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';

export default function HubScreen() {
  const usavProfiles = useSeasonStore((s) => s.usavProfiles);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const seasons = useSeasonStore((s) => s.seasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const activeSeason = seasons.find((s) => s.id === activeSeasonId);
  const athletes = useSeasonStore((s) => s.athletes);
  const activeAthlete = athletes.find((a) => a.id === activeSeason?.athlete_id);
  const forwardedEmails = useSeasonStore((s) => s.forwardedEmails);
  const ic = useIconColors();
  const { refresh, isRefreshing } = useDataRefresh();
  const externalLinks = adminConfig?.external_links ?? [];

  // Split links by scope
  const athleteLinks = externalLinks.filter((l) => {
    if (l.scope === 'athlete') return true;
    if (!l.scope) {
      const lower = l.label.toLowerCase();
      return ['sportsrecruits', 'university athlete', 'hudl'].some((k) => lower.includes(k));
    }
    return false;
  });
  const adminLinks = externalLinks.filter((l) => !athleteLinks.includes(l));
  const configuredAdminLinks = adminLinks.filter((l) => l.url);
  const unconfiguredAdminLinks = adminLinks.filter((l) => !l.url);

  const streamPlatformLabel = activeSeason?.default_streaming_platform ?? 'Stream';
  const hasMultipleAthletes = athletes.length > 1;

  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3B82B0" />}
      >
        <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold">
          Hub
        </Text>
        <Text className="text-sm text-stone dark:text-parchment mt-1 mb-6">
          Settings, travel, streaming & profiles
        </Text>

        {/* ============================================================ */}
        {/* ZONE 1: ADMIN (universal — never changes with season) */}
        {/* ============================================================ */}

        {/* Account */}
        <HubSectionHeader icon="person-circle" title="Account" iconColor={ic.muted} />

        <HubSettingsRow
          icon="person"
          iconColor="#3B82B0"
          title="Account & Co-Parent"
          subtitle="Sign out, change password, invite co-parent"
          onPress={() => router.push('/settings/account')}
        />

        {/* Travel Import */}
        <View className="mt-6">
          <HubSectionHeader icon="airplane" title="Travel Import" iconColor={ic.muted} />
        </View>

        {/* Email Forwarding */}
        <HubSettingsRow
          icon="mail-open"
          iconColor="#3B82B0"
          title="Email Forwarding"
          subtitle="Forward travel & tournament emails to RALLY"
          onPress={() => router.push('/settings/email-connect')}
        />

        {/* Copy / Paste + AI */}
        <HubSettingsRow
          icon="sparkles"
          iconColor="#7c3aed"
          title="Copy / Paste + AI"
          subtitle="Paste a confirmation and AI will extract travel details"
          onPress={() => router.push('/import/paste-travel')}
        />

        {/* Forward Email card */}
        <View
          className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2"
          style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
        >
          <View className="flex-row items-center mb-2">
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#3B82B015' }}>
              <Ionicons name="mail-open" size={16} color="#3B82B0" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-bark dark:text-cream">Forward Email</Text>
              <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                Forward a confirmation email and AI will extract travel details.
              </Text>
            </View>
          </View>
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

        {/* Manual Entry */}
        <HubSettingsRow
          icon="add-circle"
          iconColor="#6A9E8A"
          title="Manual Entry"
          subtitle="Add a hotel or flight booking manually"
          onPress={() => router.push('/booking/add-hotel')}
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

        {/* Notifications */}
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
        <View className="opacity-60">
          <HubSettingsRow
            icon="star"
            iconColor="#6A9E8A"
            title="VIP Email Alerts"
            subtitle="Coach & club email senders that trigger push notifications"
            badge={0}
            onPress={() => Alert.alert('Coming Soon', 'VIP push notifications will be available in a future release.')}
          />
        </View>

        {/* ============================================================ */}
        {/* ZONE 2: ATHLETE scope */}
        {/* ============================================================ */}
        <HubScopeDivider
          scope="Athlete"
          label={activeAthlete?.first_name ?? 'Athlete'}
          hidden={!hasMultipleAthletes}
        />

        {/* USAV Membership */}
        <View className={hasMultipleAthletes ? '' : 'mt-6'}>
          <HubSectionHeader
            icon="shield-checkmark"
            title="USAV Membership"
            iconColor="#dc2626"
            action={{ label: 'Add', onPress: () => router.push('/profile/add-usav') }}
          />
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

        {/* Athlete-scoped quick links (SportsRecruits, University Athlete, Hudl) */}
        {athleteLinks.length > 0 && (
          <View className="flex-row flex-wrap gap-3 mb-2">
            {athleteLinks.map((link, i) => {
              const originalIndex = externalLinks.indexOf(link);
              return (
                <Pressable
                  key={`${link.label}-${i}`}
                  className={`rounded-xl p-4 items-center justify-center border active:opacity-70 ${
                    link.url
                      ? 'bg-warm-white dark:bg-bark-light border-parchment dark:border-rally-900'
                      : 'bg-cream dark:bg-bark-light/50 border-dashed border-parchment dark:border-rally-900'
                  }`}
                  style={{ width: '47%', shadowColor: link.url ? '#1E3A5F' : 'transparent', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: link.url ? 2 : 0 }}
                  onPress={() => link.url ? openDeepLink(link) : router.push({ pathname: '/profile/edit-link', params: { index: String(originalIndex) } })}
                >
                  <Ionicons
                    name={link.icon_name as keyof typeof Ionicons.glyphMap}
                    size={28}
                    color={link.url ? '#3B82B0' : ic.placeholder}
                  />
                  <Text className={`text-sm font-medium mt-2 text-center ${link.url ? 'text-bark dark:text-parchment' : 'text-stone'}`}>
                    {link.label}
                  </Text>
                  {!link.url && (
                    <Text className="text-xs text-parchment mt-0.5">Tap to set up</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ============================================================ */}
        {/* ZONE 3: SEASON scope */}
        {/* ============================================================ */}
        <HubScopeDivider
          scope="Season"
          label={activeSeason ? `${activeSeason.team_name} ${activeSeason.season_year}` : 'No season'}
        />

        {/* Team Details card */}
        {activeSeason && (
          <Pressable
            className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2 active:opacity-80"
            style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
            onPress={() => router.push('/settings/team-details')}
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-sm font-semibold text-bark dark:text-cream">{activeSeason.team_name}</Text>
              <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
            </View>
            <Text className="text-xs text-stone dark:text-parchment">{activeSeason.season_year}</Text>
            {activeAthlete?.first_name && (
              <Text className="text-xs text-stone dark:text-parchment mt-0.5">{activeAthlete.first_name}</Text>
            )}
            {activeSeason.team_code && (
              <Text className="text-xs text-stone dark:text-parchment mt-0.5">Code: {activeSeason.team_code}</Text>
            )}
          </Pressable>
        )}

        {/* Schedule Import */}
        <HubSettingsRow
          icon="calendar"
          iconColor="#6A9E8A"
          title="Tournament Schedule Import"
          subtitle="Import from coach emails, copy/paste, or direct sync"
          onPress={() => router.push('/settings/schedule-import')}
        />

        {/* Default Stream Channel */}
        {activeSeason?.default_stream_url ? (
          <View
            className="bg-warm-white dark:bg-bark-light rounded-xl p-4 mb-2 border border-parchment dark:border-rally-900"
            style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
          >
            <View className="flex-row items-center justify-between mb-2">
              <View className="flex-row items-center flex-1">
                <Ionicons name="play-circle" size={24} color="#dc2626" />
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-semibold text-bark dark:text-cream">{streamPlatformLabel}</Text>
                  <Text className="text-xs text-stone mt-0.5" numberOfLines={1}>{activeSeason.default_stream_url}</Text>
                </View>
              </View>
              <Pressable
                onPress={() => router.push('/settings/streaming-hub')}
                className="p-1 active:opacity-60"
                hitSlop={8}
              >
                <Text className="text-xs font-semibold text-rally-600">Edit</Text>
              </Pressable>
            </View>
            <Pressable
              className="bg-red-600 rounded-lg py-2.5 items-center active:opacity-80 mt-1"
              onPress={() => Linking.openURL(activeSeason.default_stream_url!)}
            >
              <Text className="text-sm font-semibold text-white">Watch Now</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            className="bg-cream dark:bg-bark-light/50 rounded-xl p-5 mb-2 border border-dashed border-red-200 dark:border-red-800 items-center active:opacity-80"
            onPress={() => router.push('/settings/streaming-hub')}
          >
            <Ionicons name="videocam-outline" size={28} color="#dc2626" />
            <Text className="text-sm font-semibold text-red-700 dark:text-red-300 mt-2">
              Set Default Stream Channel
            </Text>
            <Text className="text-xs text-stone mt-1 text-center">
              YouTube, GameChanger, Baller.tv, or other
            </Text>
          </Pressable>
        )}

        {/* Add New Season */}
        {activeSeason && (
          <HubSettingsRow
            icon="add-circle"
            iconColor="#3B82B0"
            title="Add New Season"
            subtitle={`Add another season for ${activeAthlete?.first_name ?? 'your athlete'}`}
            onPress={() => router.push({ pathname: '/settings/add-season', params: { athleteId: activeSeason.athlete_id } })}
          />
        )}

        {/* ============================================================ */}
        {/* ZONE 4: QUICK LINKS (admin-scoped, bottom) */}
        {/* ============================================================ */}
        <View className="mt-6">
          <HubSectionHeader
            icon="link"
            title="Quick Links"
            iconColor={ic.muted}
            subtitle="GroupMe, LeagueApps, and other team tools"
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
                {/* Main tap area — opens the link */}
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
                {/* Edit / credentials strip */}
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

        {/* Add Another Athlete — secondary action at bottom */}
        <HubSettingsRow
          icon="person-add"
          iconColor="#6A9E8A"
          title="Add Another Athlete"
          subtitle="Manage a second player with their own seasons"
          onPress={() => router.push('/settings/add-athlete')}
        />
      </ScrollView>
    </View>
  );
}

// Deep link schemes for known apps
const APP_SCHEMES: Record<string, string> = {
  'GroupMe': 'groupme://',
  'LeagueApps': 'leagueapps://',
  'TeamSnap': 'teamsnap://',
};

async function openDeepLink(link: { label: string; url: string }) {
  const scheme = APP_SCHEMES[link.label];
  if (scheme) {
    const canOpen = await Linking.canOpenURL(scheme);
    if (canOpen) {
      Linking.openURL(scheme);
      return;
    }
  }
  Linking.openURL(link.url);
}
