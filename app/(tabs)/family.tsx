import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, Share, Platform } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useGuestStore } from '@/stores/useGuestStore';
import { useDataRefresh } from '@/providers/DataProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useIconColors, CORAL } from '@/lib/colors';
import { tapLight } from '@/lib/haptics';
import { trackEvent } from '@/lib/track-event';
import { showToast } from '@/components/Toast';
import Avatar from '@/components/Avatar';
import AthleteCredentialCard from '@/components/AthleteCredentialCard';
import { vaultRefFor } from '@/lib/credentials';
import ReferFriend from '@/components/ReferFriend';
import { fetchMyCoaches, isSupabaseConfigured } from '@/lib/coach';
import { createCoachInvite, coachInviteMessage } from '@/lib/coachInvites';
import { useCoachInvite } from '@/lib/useCoachInvite';
import type { Coach } from '@/types/database';

const AVATAR_COLORS = ['#3B82B0', '#7c3aed', '#6A9E8A', '#d97706', '#dc2626', '#0d9488', '#be185d', '#4f46e5', '#ca8a04', '#0891b2'];

function Section({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <View className="flex-row items-center mb-2 px-1">
        <Text className="text-xs font-bold uppercase tracking-wider text-stone flex-1">{title}</Text>
        {action && (
          <Pressable onPress={action.onPress} hitSlop={8} accessibilityLabel={action.label}>
            <Text className="text-xs font-bold text-rally-600">{action.label}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

function Row({ icon, color, title, subtitle, right, onPress, a11y, leading }: {
  icon?: keyof typeof Ionicons.glyphMap; color?: string; title: string; subtitle?: string; leading?: React.ReactNode;
  right?: React.ReactNode; onPress?: () => void; a11y?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 mb-2 flex-row items-center border border-parchment dark:border-rally-900 active:opacity-80"
      accessibilityLabel={a11y ?? title}
    >
      {leading ? <View className="mr-3">{leading}</View> : null}
      {icon && (
        <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: (color ?? '#3B82B0') + '18' }}>
          <Ionicons name={icon} size={19} color={color ?? '#3B82B0'} />
        </View>
      )}
      <View className="flex-1">
        <Text className="text-sm font-semibold text-bark dark:text-cream">{title}</Text>
        {subtitle ? <Text className="text-xs text-stone dark:text-parchment mt-0.5">{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={16} color="#8FA8BF" /> : null)}
    </Pressable>
  );
}

/** Family tab: athletes, coaches, co-parents & guests, and family logins. */
export default function FamilyScreen() {
  const ic = useIconColors();
  const { user } = useAuth();
  const { refresh, isRefreshing } = useDataRefresh();
  const athletes = useSeasonStore((s) => s.athletes);
  const seasons = useSeasonStore((s) => s.seasons);
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const guests = useGuestStore((s) => s.guests);

  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [loginsY, setLoginsY] = useState<number | null>(null);
  useEffect(() => {
    if (focus === 'logins' && loginsY !== null) scrollRef.current?.scrollTo({ y: Math.max(0, loginsY - 12), animated: true });
  }, [focus, loginsY]);

  const [coaches, setCoaches] = useState<Coach[]>([]);

  const load = useCallback(() => {
    if (!isSupabaseConfigured) return;
    fetchMyCoaches().then(({ data }) => setCoaches(data.filter((c) => c.user_id !== user?.id)));
  }, [user?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const externalLinks = adminConfig?.external_links ?? [];
  const familyLogins = externalLinks.filter((l) => l.scope !== 'athlete' && (l.url || l.username || l.password || l.has_password));
  const athleteFirst = athletes.length === 1 ? athletes[0].first_name : athletes.length > 1 ? athletes.map((a) => a.first_name).join(' and ') : 'our athlete';

  const sendInvite = async (code: string | null, event: string) => {
    const message = coachInviteMessage(athleteFirst, code);
    if (Platform.OS === 'web') {
      await Clipboard.setStringAsync(message);
      showToast('Invite copied — paste it into a text to your coach');
    } else {
      await Share.share({ message });
    }
    if (user) trackEvent(user.id, event, { has_code: !!code });
  };

  const sendCoachInvite = useCoachInvite(athletes);
  const inviteCoach = async () => {
    tapLight();
    const how = await sendCoachInvite();
    if (how !== 'cancelled' && user) trackEvent(user.id, 'coach_invite_sent', { channel: `family_${how}` });
  };



  return (
    <View className="flex-1 bg-cream dark:bg-bark">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { refresh(); load(); }} tintColor="#3B82B0" />}
      >
        <Text className="text-2xl font-bold text-bark dark:text-cream font-nunito-extrabold mb-4">Family</Text>

        {/* Athletes */}
        <Section title="Athletes" action={{ label: '+ Add', onPress: () => router.push('/settings/add-athlete') }}>
          {athletes.map((a) => {
            const team = seasons.filter((s) => s.athlete_id === a.id).sort((x, y) => y.season_year.localeCompare(x.season_year))[0];
            const color = a.avatar_color || AVATAR_COLORS[a.first_name.charCodeAt(0) % AVATAR_COLORS.length];
            return (
              <Pressable
                key={a.id}
                onPress={() => router.push(`/athlete/${a.id}`)}
                className="bg-warm-white dark:bg-bark-light rounded-xl p-3.5 mb-2 flex-row items-center border border-parchment dark:border-rally-900 active:opacity-80"
                accessibilityLabel={`${a.first_name} ${a.last_name ?? ''}`.trim()}
              >
                <View className="mr-3">
                  {a.photo_url ? <Avatar uri={a.photo_url} name={a.first_name} size={40} /> : (
                    <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: color }}>
                      <Text className="text-base font-bold text-cream">{a.first_name.charAt(0)}</Text>
                    </View>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-bark dark:text-cream">{a.first_name} {a.last_name ?? ''}</Text>
                  <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                    {team ? `${team.team_name} · ${team.season_year}` : 'Profile, logins, health & safety'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
              </Pressable>
            );
          })}
        </Section>

        {/* Coaches */}
        <Section title="Coaches">
          {coaches.map((c) => (
            <Row
              key={c.id}
              leading={<Avatar uri={c.photo_url ?? null} name={c.display_name} size={40} />}
              title={c.display_name}
              subtitle="Open times, lessons and signed documents"
              onPress={() => router.push({ pathname: '/coaching/[coachId]', params: { coachId: c.id } })}
              right={
                <Pressable
                  onPress={() => router.push({ pathname: '/coaching/availability', params: { coachId: c.id } })}
                  className="rounded-full px-3 py-1.5 active:opacity-80"
                  style={{ backgroundColor: CORAL }}
                  accessibilityLabel={`Book with ${c.display_name}`}
                >
                  <Text className="text-xs font-bold text-white">Book</Text>
                </Pressable>
              }
            />
          ))}
          <Row
            icon="person-add"
            title={coaches.length ? 'Invite another coach' : 'Invite your coach'}
            subtitle="Setting, hitting, strength — book and pay for lessons here, free for coaches"
            onPress={inviteCoach}
          />
          <Row icon="link" color="#6A9E8A" title="Have a coach's link or code?" onPress={() => router.push('/lessons')} />
        </Section>

        {/* People */}
        <Section title="Co-parents & guests">
          <Row icon="people" color="#0d9488" title="Co-parents" subtitle="Share the family calendar and travel" onPress={() => router.push('/settings/invite-coparent')} />
          <Row
            icon="heart"
            color="#7c3aed"
            title="Guests"
            subtitle={guests.length ? `${guests.length} guest${guests.length === 1 ? '' : 's'} · grandparents, family & friends` : 'Grandparents, family & friends'}
            onPress={() => router.push('/guests')}
          />
        </Section>

        {/* Family logins */}
        <View onLayout={(e) => setLoginsY(e.nativeEvent.layout.y)} />
        <Section title="Family logins" action={{ label: '+ Add', onPress: () => router.push('/profile/edit-link') }}>
          {familyLogins.length ? (
            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              {familyLogins.map((link, i) => (
                <View key={`${link.label}-${i}`} style={{ width: '31%' }}>
                  <AthleteCredentialCard
                    label={link.label}
                    url={link.url}
                    username={link.username ?? null}
                    password={link.password ?? null}
                    vault={vaultRefFor(adminConfig?.id, link)}
                    icon={link.icon_name}
                    onEdit={() => router.push({ pathname: '/profile/edit-link', params: { index: String(externalLinks.indexOf(link)) } })}
                  />
                </View>
              ))}
            </View>
          ) : (
            <Row icon="key-outline" color="#ca8a04" title="Save a family login" subtitle="GroupMe, LeagueApps, AES — logins that cover all your athletes" onPress={() => router.push('/profile/edit-link')} />
          )}
          <Text className="text-[11px] text-stone dark:text-parchment mt-2 px-1">
            Recruiting and member logins (Sports Recruits, USA Volleyball, Hudl) live on each athlete's page.
          </Text>
        </Section>

        <ReferFriend />
      </ScrollView>
    </View>
  );
}
