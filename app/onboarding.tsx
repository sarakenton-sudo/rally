import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ActivityIndicator,
  Image,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { useAuth } from '@/providers/AuthProvider';
import { useDataRefresh } from '@/providers/DataProvider';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { notifySuccess } from '@/lib/haptics';
import type { AdminConfig, Tournament, Athlete, Season, ExternalLink } from '@/types/database';
import { smartExtract as smartExtractOnboarding } from '@/lib/schedule-parser';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const SEASON_OPTIONS = ['2025-2026', '2026-2027'];
const TOTAL_STEPS = 9; // Steps 0-8

// Brand styles for credential tiles
const CREDENTIAL_BRANDS: { key: string; label: string; bg: string; icon: keyof typeof Ionicons.glyphMap; membershipOnly?: boolean }[] = [
  { key: 'sportsrecruits', label: 'SportsRecruits', bg: '#1B4D7E', icon: 'school' },
  { key: 'hudl', label: 'Hudl', bg: '#FF6600', icon: 'videocam' },
  { key: 'instagram', label: 'Instagram', bg: '#E1306C', icon: 'logo-instagram' },
  { key: 'university athlete', label: 'University Athlete', bg: '#E8520E', icon: 'trophy' },
  { key: 'usa volleyball', label: 'USA Volleyball', bg: '#dc2626', icon: 'shield-checkmark', membershipOnly: true },
];

// Relationship chip options for guests
const RELATIONSHIP_OPTIONS = ['Grandparent', 'Family', 'Other'];

// ---- Shared sub-components ----

function ProgressBar({ step }: { step: number }) {
  const progress = useSharedValue(0);
  progress.value = withTiming(step / (TOTAL_STEPS - 1), { duration: 350 });
  const animStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));
  return (
    <View style={{ height: 4, backgroundColor: '#D8E2EC' }}>
      <Animated.View style={[{ height: 4, backgroundColor: '#3B82B0', borderRadius: 2 }, animStyle]} />
    </View>
  );
}

function StepHeader({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#E8F0F8', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color="#3B82B0" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 24, fontFamily: 'Nunito-Black', color: '#1E3A5F' }}>{title}</Text>
        <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#6B8BA8' }}>{subtitle}</Text>
      </View>
    </View>
  );
}

function SkipButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={{ paddingVertical: 8 }} className="active:opacity-70" onPress={onPress}>
      <Text style={{ fontSize: 13, color: '#4A6E8A', fontFamily: 'NunitoSans-SemiBold' }}>I'll do this later</Text>
    </Pressable>
  );
}

function DashboardButton({ onPress, saving }: { onPress: () => void; saving: boolean }) {
  return (
    <Pressable style={{ paddingVertical: 8, opacity: saving ? 0.5 : 1 }} className="active:opacity-70" onPress={onPress} disabled={saving}>
      {saving ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ActivityIndicator size="small" color="#4A6E8A" />
          <Text style={{ fontSize: 13, color: '#4A6E8A', fontFamily: 'NunitoSans-SemiBold' }}>Setting up...</Text>
        </View>
      ) : (
        <Text style={{ fontSize: 13, color: '#4A6E8A', fontFamily: 'NunitoSans-SemiBold' }}>Go to Dashboard</Text>
      )}
    </Pressable>
  );
}

function ContinueButton({ onPress, disabled, label = 'Continue' }: { onPress: () => void; disabled?: boolean; label?: string }) {
  return (
    <Pressable
      style={{
        backgroundColor: '#3B82B0',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        opacity: disabled ? 0.4 : 1,
        shadowColor: '#3B82B0',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 3,
      }}
      className="active:opacity-80"
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={{ fontSize: 15, fontFamily: 'Nunito-ExtraBold', color: '#FEFEFE' }}>{label}</Text>
    </Pressable>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={{ paddingVertical: 16, paddingHorizontal: 24, borderRadius: 14, borderWidth: 1.5, borderColor: '#D8E2EC' }}
      className="active:opacity-70"
      onPress={onPress}
    >
      <Ionicons name="arrow-back" size={20} color="#1E3A5F" />
    </Pressable>
  );
}

// Input style constants
const INPUT_STYLE = {
  backgroundColor: '#FEFEFE',
  borderWidth: 1.5,
  borderColor: '#D8E2EC',
  borderRadius: 14,
  paddingHorizontal: 16,
  paddingVertical: 12,
  fontSize: 15,
  color: '#1E3A5F',
  fontFamily: 'NunitoSans-Regular',
} as const;

// ---- Main Component ----

type GuestEntry = { name: string; relation: string; phone: string };

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const { user, acceptInvite } = useAuth();
  const { refresh } = useDataRefresh();

  // Invite code (for athletes/co-parents joining via Google auth)
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const handleAcceptInvite = async () => {
    const code = inviteCode.trim();
    if (!code) { setInviteError('Please enter your invite code.'); return; }
    setInviteLoading(true);
    setInviteError('');
    const { error } = await acceptInvite(code);
    setInviteLoading(false);
    if (error) {
      setInviteError(error);
    } else {
      // Invite accepted — refresh data and go to tabs
      await refresh();
      router.replace('/(tabs)');
    }
  };

  // Step 1: Athlete
  const AVATAR_COLORS = [
    '#3B82B0', '#7c3aed', '#6A9E8A', '#d97706', '#dc2626',
    '#0d9488', '#be185d', '#4f46e5', '#ca8a04', '#0891b2',
  ];
  const [athleteFirstName, setAthleteFirstName] = useState('');
  const [athleteLastName, setAthleteLastName] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);

  // Computed display name (first + last) — used for labels throughout wizard
  const athleteName = [athleteFirstName.trim(), athleteLastName.trim()].filter(Boolean).join(' ');

  // Step 2: Season / Team
  const [clubName, setClubName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [seasonYear, setSeasonYear] = useState(SEASON_OPTIONS[0]);

  // Step 3: Tournaments (schedule extraction)
  const [pasteText, setPasteText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedTournaments, setExtractedTournaments] = useState<any[]>([]);
  const [extractError, setExtractError] = useState('');

  // Step 4: Travel extraction
  const [travelPasteText, setTravelPasteText] = useState('');
  const [isExtractingTravel, setIsExtractingTravel] = useState(false);
  const [extractedBookings, setExtractedBookings] = useState<any[]>([]);
  const [travelExtractError, setTravelExtractError] = useState('');
  const [trustedEmailInput, setTrustedEmailInput] = useState('');
  const [trustedEmails, setTrustedEmails] = useState<string[]>([]);

  // Step 5: Credentials
  const [credentials, setCredentials] = useState<Record<string, { username: string; password: string; link?: string }>>({});
  const [savedCredentials, setSavedCredentials] = useState<Set<string>>(new Set());
  const [expandedCredential, setExpandedCredential] = useState<string | null>(null);

  // Step 6: Guests
  const [guests, setGuests] = useState<GuestEntry[]>([{ name: '', relation: 'Grandparent', phone: '' }]);

  // Step 7: Co-parent
  const [coParentEmail, setCoParentEmail] = useState('');
  const [coParentPermission, setCoParentPermission] = useState<'view' | 'manage'>('view');

  // Step 8: Athlete login
  const [athleteLoginEmail, setAthleteLoginEmail] = useState('');

  // Email forwarding
  const [forwardAddressCopied, setForwardAddressCopied] = useState(false);

  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState('');

  const goTo = (index: number) => setStep(index);

  // ---- Schedule extraction (reused from old step 3) ----
  const handleExtractSchedule = async () => {
    const trimmed = pasteText.trim();
    if (!trimmed) { setExtractError('Paste your schedule text above first.'); return; }
    setIsExtracting(true); setExtractError(''); setExtractedTournaments([]);
    try {
      let tournaments: any[] = [];
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/extract-schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY },
            body: JSON.stringify({ text: trimmed }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const data = await resp.json();
          if (resp.ok && data.tournaments?.length > 0) tournaments = data.tournaments;
        } catch (e) { console.warn('AI extraction failed:', e); }
      }
      if (tournaments.length === 0) tournaments = smartExtractOnboarding(trimmed);
      if (tournaments.length === 0) setExtractError('Could not find any tournaments. Try a different format.');
      else setExtractedTournaments(tournaments);
    } catch (err: any) { setExtractError(err.message || 'Something went wrong.'); }
    finally { setIsExtracting(false); }
  };

  // ---- Travel extraction (from paste-travel.tsx pattern) ----
  const handleExtractTravel = async () => {
    const trimmed = travelPasteText.trim();
    if (!trimmed) { setTravelExtractError('Paste a hotel or flight confirmation above first.'); return; }
    setIsExtractingTravel(true); setTravelExtractError(''); setExtractedBookings([]);
    try {
      let bookings: any[] = [];
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.functions.invoke('extract-travel', {
          body: { text: trimmed },
        });
        if (error) throw new Error(error.message);
        bookings = data?.bookings || [];
      } else {
        // Simple mock for dev
        bookings = mockExtractTravel(trimmed);
      }
      if (bookings.length === 0) setTravelExtractError('No bookings found. Try pasting a different format.');
      else setExtractedBookings(bookings);
    } catch (err: any) { setTravelExtractError(err.message || 'Something went wrong.'); }
    finally { setIsExtractingTravel(false); }
  };

  const handleCopyForwardAddress = () => {
    if (Platform.OS === 'web') {
      navigator.clipboard.writeText('plans@rally-hub.com');
    } else {
      Clipboard.setStringAsync('plans@rally-hub.com');
    }
    setForwardAddressCopied(true);
    setTimeout(() => setForwardAddressCopied(false), 2000);
  };

  const toggleCredential = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedCredential === key) {
      // Collapsing — mark as saved if it has content
      const cred = credentials[key];
      if (cred && (cred.username.trim() || cred.password.trim())) {
        setSavedCredentials((prev) => new Set(prev).add(key));
      }
      setExpandedCredential(null);
    } else {
      setExpandedCredential(key);
    }
  };

  const updateCredential = (key: string, field: 'username' | 'password' | 'link', value: string) => {
    setCredentials((prev) => ({
      ...prev,
      [key]: { ...prev[key] || { username: '', password: '', link: '' }, [field]: value },
    }));
  };

  const addGuest = () => {
    setGuests([...guests, { name: '', relation: 'Grandparent', phone: '' }]);
  };

  // Returns true if all guests with names also have phone numbers
  const validateGuests = (): boolean => {
    const guestsWithNames = guests.filter((g) => g.name.trim());
    const missing = guestsWithNames.find((g) => !g.phone.trim());
    if (missing) {
      Alert.alert('Phone required', `Please add a phone number for ${missing.name.trim()}. Guests need a phone number to receive tournament updates.`);
      return false;
    }
    return true;
  };

  // ---- FINISH ----
  const handleFinish = async () => {
    if (!athleteFirstName.trim()) { Alert.alert('Athlete name required', "Please go back and enter your athlete's first name."); goTo(1); return; }
    if (!teamName.trim()) { Alert.alert('Team name required', 'Please go back and enter your team name.'); goTo(2); return; }
    setSaving(true); setFinishError('');

    if (isSupabaseConfigured && user) {
      try {
        // 1. Setup onboarding RPC
        const tournamentPayload = extractedTournaments.map((t) => ({
          name: t.name, start_date: t.start_date, end_date: t.end_date,
          location_city: t.location_city || null,
          venues: t.venue_name ? [{ label: t.venue_name, address: t.venue_address || '', is_confirmed: false }] : [],
        }));

        const guestPayload = guests.filter((g) => g.name.trim()).map((g) => ({
          name: g.name.trim(), relationship: g.relation, phone: g.phone.trim() || null,
        }));

        const { data: rpcResult, error: rpcError } = await supabase.rpc('setup_onboarding', {
          p_athlete_name: [athleteFirstName.trim(), athleteLastName.trim()].filter(Boolean).join(' '),
          p_team_name: teamName.trim(),
          p_club_name: clubName.trim() || null,
          p_season_year: seasonYear,
          p_team_code: null,
          p_streaming_url: null,
          p_gmail_connected: false,
          p_gmail_email: null,
          p_trusted_sender_emails: trustedEmails,
          p_tournaments: tournamentPayload,
          p_additional_athletes: [],
          p_guests: guestPayload,
        });

        if (rpcError) throw new Error(rpcError.message);
        const result = rpcResult as { success: boolean; error?: string; athlete_id?: string; season_id?: string; config_id?: string };
        if (!result.success) throw new Error(result.error ?? 'Onboarding setup failed');

        // 2. Populate Zustand store
        const store = useSeasonStore.getState();
        store.setAdminConfig({
          id: result.config_id ?? user.id,
          user_id: user.id,
          club_email_domain: null,
          rally_forward_address: 'plans@rally-hub.com',
          trusted_sender_emails: [],
          vip_sender_emails: [],
          notification_preferences: {
            tournament_reminders: true, cancellation_deadlines: true,
            email_arrivals: true, rsvp_responses: true, schedule_changes: true,
          },
          ical_feed_token: '',
          youtube_channel_id: null,
          default_streaming_platform: null,
          default_stream_url: null,
          travel_sync_emails: [],
          gmail_connected: false,
          gmail_email: null,
          external_links: [],
          active_season_id: result.season_id!,
          created_at: new Date().toISOString(),
        });
        store.setActiveSeasonId(result.season_id!);
        store.setAthletes([{
          id: result.athlete_id!, user_id: null,
          first_name: athleteFirstName.trim() || 'My Athlete', last_name: athleteLastName.trim() || null,
          avatar_color: avatarColor,
          can_edit: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]);
        store.setSeasons([{
          id: result.season_id!, athlete_id: result.athlete_id!,
          team_name: teamName.trim(), club_name: clubName.trim() || null,
          season_year: seasonYear, sport: 'volleyball',
          team_code: null, schedule_import_source: null,
          schedule_import_connected: false, is_active: true,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]);
        if (extractedTournaments.length > 0) {
          store.setTournaments(extractedTournaments.map((t, i) => ({
            id: `pending-${i}`,
            season_id: result.season_id!,
            name: t.name,
            start_date: t.start_date,
            end_date: t.end_date,
            location_city: t.location_city || null,
            venues: t.venue_name ? [{ label: t.venue_name, address: t.venue_address || '', is_confirmed: false }] : [],
            status: 'upcoming' as const,
            travel_required: true,
            created_at: new Date().toISOString(),
          } as any)));
        }
        store.setLoading(false);

        // 2b. Fire-and-forget: save avatar color on athlete
        if (avatarColor) {
          supabase.from('athletes').update({ avatar_color: avatarColor }).eq('id', result.athlete_id!).then(() => {}).catch(() => {});
        }

        // 3. Fire-and-forget: credentials → external_links
        if (Object.keys(credentials).length > 0) {
          const externalLinks: ExternalLink[] = Object.entries(credentials)
            .filter(([, cred]) => cred.username.trim() || cred.password.trim() || cred.link?.trim())
            .map(([key, cred]) => {
              const brand = CREDENTIAL_BRANDS.find((b) => b.key === key);
              return {
                label: brand?.label || key,
                url: (key === 'instagram' && cred.link?.trim()) ? cred.link.trim() : '',
                icon_name: String(brand?.icon || 'globe'),
                username: cred.username.trim() || null,
                password: cred.password.trim() || null,
              };
            });
          if (externalLinks.length > 0) {
            updateAdminConfig(result.config_id ?? user.id, { external_links: externalLinks }).catch(() => {});
          }
        }

        // 4. Fire-and-forget: co-parent invite
        if (coParentEmail.trim()) {
          supabase.from('athlete_invites').insert({
            inviter_id: user.id,
            athlete_id: result.athlete_id!,
            email: coParentEmail.trim().toLowerCase(),
            invite_type: 'admin',
            permission: coParentPermission,
          } as any).then(() => {}).catch(() => {});
        }

        // 5. Fire-and-forget: athlete invite
        if (athleteLoginEmail.trim()) {
          supabase.from('athlete_invites').insert({
            inviter_id: user.id,
            athlete_id: result.athlete_id!,
            email: athleteLoginEmail.trim().toLowerCase(),
            invite_type: 'athlete',
            permission: 'view',
          } as any).then(() => {}).catch(() => {});
        }

        // 6. Haptic + navigate
        notifySuccess();
        console.log('[Onboarding] Setup complete, navigating to dashboard');
        router.replace('/(tabs)');
        setTimeout(() => { refresh().catch(() => {}); }, 1500);
      } catch (err: any) {
        setSaving(false);
        console.error('[Onboarding] Error:', err);
        const msg = err?.message ?? 'Something went wrong during setup.';
        if (Platform.OS === 'web') {
          setFinishError(msg);
        } else {
          Alert.alert('Error', msg);
        }
        return;
      }
    } else {
      // Dev mode — mock setup
      const store = useSeasonStore.getState();
      const mockSeasonId = 'season-dev-001';
      const mockAthleteId = 'athlete-dev-001';
      store.setAdminConfig({
        id: 'onboarding-dev', user_id: 'dev', club_email_domain: null, rally_forward_address: 'plans@rally-hub.com',
        trusted_sender_emails: [], vip_sender_emails: [], notification_preferences: {
          tournament_reminders: true, cancellation_deadlines: true, email_arrivals: true, rsvp_responses: true, schedule_changes: true,
        }, ical_feed_token: '', youtube_channel_id: null, default_streaming_platform: null,
        default_stream_url: null, travel_sync_emails: [], gmail_connected: false, gmail_email: null,
        external_links: [], active_season_id: mockSeasonId, created_at: new Date().toISOString(),
      });
      store.setAthletes([{ id: mockAthleteId, user_id: null, first_name: athleteFirstName.trim() || 'My Athlete', last_name: athleteLastName.trim() || null, avatar_color: avatarColor, can_edit: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
      store.setSeasons([{ id: mockSeasonId, athlete_id: mockAthleteId, team_name: teamName.trim(), club_name: clubName.trim() || null, season_year: seasonYear, sport: 'volleyball', team_code: null, schedule_import_source: null, schedule_import_connected: false, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
      store.setActiveSeasonId(mockSeasonId);
      notifySuccess();
      router.replace('/(tabs)');
    }
    setSaving(false);
  };

  // Can finish from any skippable step (3-8)
  const canFinish = step >= 3;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#F4F6F8' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        {/* Animated progress bar */}
        <ProgressBar step={step} />

        {/* ========== Step 0: Welcome ========== */}
        {step === 0 && (
          <View className="flex-1 justify-center items-center px-8">
            <Image source={require('@/assets/images/rallyhub_lockup_light.png')} style={{ width: 220, height: 64 }} resizeMode="contain" />
            <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-SemiBold', color: '#6B8BA8', textAlign: 'center', marginTop: 12, marginBottom: 8, maxWidth: 280 }}>
              Your hub for everything volleyball.
            </Text>

            <View style={{ marginTop: 24, marginBottom: 40, gap: 16 }}>
              {[
                { icon: 'trophy' as const, text: 'Tournaments, travel, and schedules in one place' },
                { icon: 'key' as const, text: 'Save logins and credentials you always forget' },
                { icon: 'heart' as const, text: 'Keep grandparents and family in the loop' },
              ].map((item) => (
                <View key={item.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(59,130,176,0.1)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={item.icon} size={16} color="#3B82B0" />
                  </View>
                  <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Regular', color: '#1E3A5F', flex: 1 }}>{item.text}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={{
                backgroundColor: '#3B82B0', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 56,
                shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
              }}
              className="active:opacity-80"
              onPress={() => goTo(1)}
            >
              <Text style={{ fontSize: 16, fontFamily: 'Nunito-ExtraBold', color: '#FEFEFE' }}>Let's Go</Text>
            </Pressable>

            {/* Invite code section */}
            <View style={{ marginTop: 32, width: '100%', maxWidth: 320 }}>
              <View style={{ height: 1, backgroundColor: '#D8E2EC', marginBottom: 20 }} />
              <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-SemiBold', color: '#6B8BA8', textAlign: 'center', marginBottom: 12 }}>
                Co-parent, athlete, or family member?{'\n'}Enter your invite code to join.
              </Text>
              <TextInput
                style={{
                  ...INPUT_STYLE,
                  textAlign: 'center',
                  marginBottom: 10,
                }}
                placeholder="Enter invite code"
                placeholderTextColor="#8FA8BF"
                value={inviteCode}
                onChangeText={(t) => { setInviteCode(t); setInviteError(''); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {inviteError ? (
                <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-SemiBold', color: '#dc2626', textAlign: 'center', marginBottom: 8 }}>
                  {inviteError}
                </Text>
              ) : null}
              <Pressable
                style={{
                  backgroundColor: inviteCode.trim() ? '#6A9E8A' : '#D8E2EC',
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: 'center',
                  opacity: inviteLoading ? 0.6 : 1,
                }}
                className="active:opacity-80"
                onPress={handleAcceptInvite}
                disabled={inviteLoading || !inviteCode.trim()}
              >
                <Text style={{ fontSize: 14, fontFamily: 'Nunito-ExtraBold', color: inviteCode.trim() ? '#FEFEFE' : '#8FA8BF' }}>
                  {inviteLoading ? 'Joining...' : 'Join with Invite Code'}
                </Text>
              </Pressable>
            </View>

            <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-SemiBold', color: '#8FA8BF', textAlign: 'center', marginTop: 24, maxWidth: 280 }}>
              RALLY is for tournaments, not practices.{'\n'}Plenty of apps exist for that.
            </Text>
          </View>
        )}

        {/* ========== Step 1: Create Athlete ========== */}
        {step === 1 && (
          <View className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="person" title="Your Athlete" subtitle="Who's playing?" />

              <Text style={{ fontSize: 17, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F', marginBottom: 12 }}>
                What's your athlete's name?
              </Text>

              <TextInput
                value={athleteFirstName}
                onChangeText={setAthleteFirstName}
                placeholder="First name"
                placeholderTextColor="#8FA8BF"
                style={{ ...INPUT_STYLE, fontSize: 20, paddingVertical: 16, marginBottom: 12 }}
                autoFocus
              />

              <TextInput
                value={athleteLastName}
                onChangeText={setAthleteLastName}
                placeholder="Last name"
                placeholderTextColor="#8FA8BF"
                style={{ ...INPUT_STYLE, fontSize: 20, paddingVertical: 16 }}
              />

              {/* Avatar Color Picker */}
              <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#8FA8BF', marginTop: 20, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                Pick a color
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: avatarColor, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: '#FEFEFE' }}>
                    {athleteFirstName ? athleteFirstName.charAt(0).toUpperCase() : '?'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', flex: 1, gap: 8 }}>
                  {AVATAR_COLORS.map((color) => (
                    <Pressable
                      key={color}
                      onPress={() => setAvatarColor(color)}
                      style={{
                        width: 28, height: 28, borderRadius: 14,
                        backgroundColor: color,
                        borderWidth: avatarColor === color ? 2.5 : 0,
                        borderColor: '#FEFEFE',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {avatarColor === color && <Ionicons name="checkmark" size={14} color="#FEFEFE" />}
                    </Pressable>
                  ))}
                </View>
              </View>

              <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#6B8BA8', marginTop: 12 }}>
                You can add more players later in Settings.
              </Text>
            </ScrollView>

            <View style={{ marginTop: 'auto', paddingBottom: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <BackButton onPress={() => goTo(0)} />
                <View style={{ flex: 1 }}>
                  <ContinueButton
                    onPress={() => {
                      if (!athleteFirstName.trim()) { Alert.alert('Name required', "Enter your athlete's first name."); return; }
                      goTo(2);
                    }}
                    disabled={!athleteFirstName.trim()}
                  />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ========== Step 2: Season / Team ========== */}
        {step === 2 && (
          <View className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="trophy" title="Season & Team" subtitle={`${athleteName.trim()}'s team info`} />

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F', marginBottom: 6 }}>Team Name</Text>
                <TextInput value={teamName} onChangeText={setTeamName} placeholder="e.g. AJV Travel 14u" placeholderTextColor="#8FA8BF" style={INPUT_STYLE} />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F', marginBottom: 6 }}>
                  Club Name <Text style={{ fontFamily: 'NunitoSans-Regular', color: '#8FA8BF' }}>(optional)</Text>
                </Text>
                <TextInput value={clubName} onChangeText={setClubName} placeholder="e.g. Austin Juniors Volleyball" placeholderTextColor="#8FA8BF" style={INPUT_STYLE} />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F', marginBottom: 6 }}>Season</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {SEASON_OPTIONS.map((opt) => (
                    <Pressable key={opt} style={{
                      flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
                      backgroundColor: seasonYear === opt ? '#3B82B0' : '#E8F0F8',
                      borderWidth: 1.5, borderColor: seasonYear === opt ? '#3B82B0' : '#D8E2EC',
                    }} onPress={() => setSeasonYear(opt)}>
                      <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: seasonYear === opt ? '#FEFEFE' : '#8FA8BF' }}>{opt}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={{ marginTop: 'auto', paddingBottom: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <BackButton onPress={() => goTo(1)} />
                <View style={{ flex: 1 }}>
                  <ContinueButton
                    onPress={() => {
                      if (!teamName.trim()) { Alert.alert('Team name required', 'Please enter your team name.'); return; }
                      goTo(3);
                    }}
                    disabled={!teamName.trim()}
                  />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ========== Step 3: Add Tournaments ========== */}
        {step === 3 && (
          <View className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="calendar" title="Tournaments" subtitle="Add your upcoming tournaments" />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, backgroundColor: '#E8F4FF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Ionicons name="sparkles" size={18} color="#3B82B0" />
                <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-Bold', color: '#1E3A5F' }}>
                  Option 1: Paste + AI
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#4A6E8A', marginBottom: 16 }}>
                Paste a coach message, email, or tournament list and we'll extract the details.
              </Text>

              <TextInput
                value={pasteText} onChangeText={setPasteText} multiline textAlignVertical="top"
                placeholder={"Paste schedule here...\n\ne.g. Lonestar Classic - Jan 17-19, 2026 - Dallas, TX"}
                placeholderTextColor="#8FA8BF"
                style={{ ...INPUT_STYLE, minHeight: 120, marginBottom: 12, paddingTop: 12 }}
              />

              <Pressable
                style={{
                  borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginBottom: 16,
                  backgroundColor: isExtracting || !pasteText.trim() ? '#E8F0F8' : '#3B82B0',
                  shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: !pasteText.trim() ? 0 : 0.15, shadowRadius: 6,
                }}
                onPress={handleExtractSchedule} disabled={isExtracting || !pasteText.trim()}
              >
                {isExtracting ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color="#FEFEFE" />
                    <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: '#FEFEFE' }}>Extracting...</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: !pasteText.trim() ? '#8FA8BF' : '#FEFEFE' }}>Extract Tournaments</Text>
                )}
              </Pressable>

              {extractError ? (
                <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.3)' }}>
                  <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-SemiBold', color: '#fca5a5', textAlign: 'center' }}>{extractError}</Text>
                </View>
              ) : null}

              {extractedTournaments.length > 0 && (
                <View style={{ backgroundColor: 'rgba(106,158,138,0.1)', borderWidth: 2, borderColor: 'rgba(106,158,138,0.35)', borderRadius: 20, padding: 16, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Ionicons name="checkmark-circle" size={22} color="#6A9E8A" />
                    <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-Bold', color: '#6A9E8A' }}>
                      {extractedTournaments.length} tournament{extractedTournaments.length !== 1 ? 's' : ''} found!
                    </Text>
                  </View>
                  {extractedTournaments.map((t, i) => (
                    <View key={i} style={{ backgroundColor: '#FEFEFE', borderWidth: 1, borderColor: 'rgba(106,158,138,0.2)', borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(106,158,138,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="trophy" size={18} color="#6A9E8A" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Bold', color: '#1E3A5F' }}>{t.name}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'NunitoSans-Regular', color: '#6B8BA8', marginTop: 2 }}>
                          {t.start_date}{t.end_date !== t.start_date ? ` → ${t.end_date}` : ''}{t.location_city ? `  •  ${t.location_city}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="checkmark" size={16} color="#6A9E8A" />
                    </View>
                  ))}
                </View>
              )}

              {/* Forward email hint */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 8, backgroundColor: '#E8F4FF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Ionicons name="mail" size={18} color="#3B82B0" />
                <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-Bold', color: '#1E3A5F' }}>
                  Option 2: Forward Email
                </Text>
              </View>
              <View style={{ backgroundColor: '#E8F4FF', borderWidth: 1.5, borderColor: '#B8D4EC', borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F', marginBottom: 4 }}>
                  Forward a schedule email to RALLY
                </Text>
                <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-Regular', color: '#6B8BA8', marginBottom: 10 }}>
                  We'll create your tournament weekend itinerary like magic.
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text selectable style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: '#3B82B0', flex: 1 }}>
                    plans@rally-hub.com
                  </Text>
                  <Pressable
                    style={{ backgroundColor: forwardAddressCopied ? 'rgba(106,158,138,0.2)' : 'rgba(59,130,176,0.2)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    className="active:opacity-70"
                    onPress={handleCopyForwardAddress}
                  >
                    <Ionicons name={forwardAddressCopied ? 'checkmark' : 'copy-outline'} size={14} color={forwardAddressCopied ? '#6A9E8A' : '#3B82B0'} />
                    <Text style={{ fontSize: 11, fontFamily: 'NunitoSans-Bold', color: forwardAddressCopied ? '#6A9E8A' : '#3B82B0' }}>
                      {forwardAddressCopied ? 'Copied!' : 'Copy'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>

            <View style={{ marginTop: 'auto', paddingBottom: 16, gap: 8 }}>
              {finishError ? (
                <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 14, padding: 12, marginBottom: 4, borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.3)' }}>
                  <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-SemiBold', color: '#fca5a5', textAlign: 'center' }}>{finishError}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                <DashboardButton onPress={handleFinish} saving={saving} />
                <SkipButton onPress={() => goTo(4)} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <BackButton onPress={() => goTo(2)} />
                <View style={{ flex: 1 }}>
                  <ContinueButton onPress={() => goTo(4)} />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ========== Step 4: Add Travel ========== */}
        {step === 4 && (
          <View className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="airplane" title="Travel" subtitle="Add hotel or flight bookings" />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, backgroundColor: '#E8F4FF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Ionicons name="sparkles" size={18} color="#3B82B0" />
                <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-Bold', color: '#1E3A5F' }}>
                  Option 1: Paste + AI
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#4A6E8A', marginBottom: 16 }}>
                Paste a hotel or flight confirmation and we'll extract the details.
              </Text>

              <TextInput
                value={travelPasteText} onChangeText={setTravelPasteText} multiline textAlignVertical="top"
                placeholder={"Paste confirmation here...\n\ne.g. Marriott Marquis - Check-in April 3"}
                placeholderTextColor="#8FA8BF"
                style={{ ...INPUT_STYLE, minHeight: 120, marginBottom: 12, paddingTop: 12 }}
              />

              <Pressable
                style={{
                  borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginBottom: 16,
                  backgroundColor: isExtractingTravel || !travelPasteText.trim() ? '#E8F0F8' : '#3B82B0',
                  shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 2 }, shadowOpacity: !travelPasteText.trim() ? 0 : 0.15, shadowRadius: 6,
                }}
                onPress={handleExtractTravel} disabled={isExtractingTravel || !travelPasteText.trim()}
              >
                {isExtractingTravel ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color="#FEFEFE" />
                    <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: '#FEFEFE' }}>Extracting...</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: !travelPasteText.trim() ? '#8FA8BF' : '#FEFEFE' }}>Extract Travel Details</Text>
                )}
              </Pressable>

              {travelExtractError ? (
                <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.3)' }}>
                  <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-SemiBold', color: '#fca5a5', textAlign: 'center' }}>{travelExtractError}</Text>
                </View>
              ) : null}

              {extractedBookings.length > 0 && (
                <View style={{ backgroundColor: 'rgba(106,158,138,0.1)', borderWidth: 2, borderColor: 'rgba(106,158,138,0.35)', borderRadius: 20, padding: 16, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Ionicons name="checkmark-circle" size={22} color="#6A9E8A" />
                    <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-Bold', color: '#6A9E8A' }}>
                      {extractedBookings.length} booking{extractedBookings.length !== 1 ? 's' : ''} found!
                    </Text>
                  </View>
                  {extractedBookings.map((b, i) => (
                    <View key={i} style={{ backgroundColor: '#FEFEFE', borderWidth: 1, borderColor: 'rgba(106,158,138,0.2)', borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(106,158,138,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={b.type === 'hotel' ? 'bed' : 'airplane'} size={18} color="#6A9E8A" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Bold', color: '#1E3A5F' }}>
                          {b.type === 'hotel' ? (b.hotel_name || 'Hotel') : (b.airline || 'Flight')}
                        </Text>
                        <Text style={{ fontSize: 11, fontFamily: 'NunitoSans-Regular', color: '#4A6E8A', marginTop: 2 }}>
                          {b.type === 'hotel' ? `${b.check_in || ''} → ${b.check_out || ''}` : `${b.departure_date || ''}`}
                        </Text>
                      </View>
                      <Ionicons name="checkmark" size={16} color="#6A9E8A" />
                    </View>
                  ))}
                </View>
              )}

              {/* My Email Addresses */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 8, backgroundColor: 'rgba(106,158,138,0.12)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Ionicons name="mail" size={18} color="#6A9E8A" />
                <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-Bold', color: '#1E3A5F' }}>
                  My Email Addresses
                </Text>
              </View>
              <View style={{ backgroundColor: 'rgba(106,158,138,0.08)', borderWidth: 1.5, borderColor: 'rgba(106,158,138,0.25)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F', marginBottom: 4 }}>
                  Add emails you use to book travel
                </Text>
                <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-Regular', color: '#6B8BA8', marginBottom: 10 }}>
                  Personal, work, partner's — so RALLY recognizes confirmations from all of them as yours.
                </Text>
                {trustedEmails.length > 0 && (
                  <View style={{ marginBottom: 10, gap: 6 }}>
                    {trustedEmails.map((email) => (
                      <View key={email} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(106,158,138,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
                        <Ionicons name="mail" size={14} color="#6A9E8A" />
                        <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#1E3A5F', flex: 1, marginLeft: 8 }}>{email}</Text>
                        <Pressable onPress={() => setTrustedEmails(trustedEmails.filter((e) => e !== email))} className="active:opacity-60">
                          <Ionicons name="close-circle" size={18} color="#ef4444" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(106,158,138,0.3)', paddingHorizontal: 12, paddingVertical: 8 }}>
                    <TextInput
                      value={trustedEmailInput}
                      onChangeText={setTrustedEmailInput}
                      placeholder="e.g. sara@work.com"
                      placeholderTextColor="#8FA8BF"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#1E3A5F' }}
                    />
                  </View>
                  <Pressable
                    style={{ backgroundColor: '#6A9E8A', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 }}
                    className="active:opacity-70"
                    onPress={() => {
                      const email = trustedEmailInput.trim().toLowerCase();
                      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
                      if (trustedEmails.includes(email)) { setTrustedEmailInput(''); return; }
                      setTrustedEmails([...trustedEmails, email]);
                      setTrustedEmailInput('');
                    }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-Bold', color: '#fff' }}>Add</Text>
                  </Pressable>
                </View>
              </View>

              {/* Forward email hint */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 8, backgroundColor: '#E8F4FF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Ionicons name="mail" size={18} color="#3B82B0" />
                <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-Bold', color: '#1E3A5F' }}>
                  Option 2: Forward Email
                </Text>
              </View>
              <View style={{ backgroundColor: '#E8F4FF', borderWidth: 1.5, borderColor: '#B8D4EC', borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F', marginBottom: 4 }}>
                  Forward a confirmation email to RALLY
                </Text>
                <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-Regular', color: '#6B8BA8', marginBottom: 10 }}>
                  We'll create your tournament weekend itinerary like magic.
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text selectable style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: '#3B82B0', flex: 1 }}>
                    plans@rally-hub.com
                  </Text>
                  <Pressable
                    style={{ backgroundColor: forwardAddressCopied ? 'rgba(106,158,138,0.2)' : 'rgba(59,130,176,0.2)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    className="active:opacity-70"
                    onPress={handleCopyForwardAddress}
                  >
                    <Ionicons name={forwardAddressCopied ? 'checkmark' : 'copy-outline'} size={14} color={forwardAddressCopied ? '#6A9E8A' : '#3B82B0'} />
                    <Text style={{ fontSize: 11, fontFamily: 'NunitoSans-Bold', color: forwardAddressCopied ? '#6A9E8A' : '#3B82B0' }}>
                      {forwardAddressCopied ? 'Copied!' : 'Copy'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>

            <View style={{ marginTop: 'auto', paddingBottom: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                <DashboardButton onPress={handleFinish} saving={saving} />
                <SkipButton onPress={() => goTo(5)} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <BackButton onPress={() => goTo(3)} />
                <View style={{ flex: 1 }}>
                  <ContinueButton onPress={() => goTo(5)} />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ========== Step 5: Credentials ========== */}
        {step === 5 && (
          <View className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="key" title="Credentials" subtitle="Save logins you always forget" />

              <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#4A6E8A', marginBottom: 20 }}>
                Tap a service to add your login. These are stored securely and only visible to you.
              </Text>

              {CREDENTIAL_BRANDS.map((brand) => {
                const isExpanded = expandedCredential === brand.key;
                const cred = credentials[brand.key];
                const hasValue = cred && (cred.username.trim() || cred.password.trim());
                const isSaved = savedCredentials.has(brand.key);
                return (
                  <View key={brand.key} style={{ marginBottom: 12 }}>
                    <Pressable
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        padding: 14,
                        borderRadius: 16,
                        borderWidth: 1.5,
                        borderColor: isExpanded ? '#3B82B0' : isSaved ? '#6A9E8A' : '#D8E2EC',
                        backgroundColor: '#FEFEFE',
                      }}
                      onPress={() => toggleCredential(brand.key)}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: brand.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={brand.icon} size={20} color="#FFFFFF" />
                      </View>
                      <Text style={{ flex: 1, fontSize: 15, fontFamily: 'NunitoSans-Bold', color: '#1E3A5F' }}>{brand.label}</Text>
                      {isSaved && <Ionicons name="checkmark-circle" size={20} color="#6A9E8A" />}
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#8FA8BF" />
                    </Pressable>

                    {isExpanded && (
                      <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
                        <TextInput
                          value={cred?.username || ''}
                          onChangeText={(v) => updateCredential(brand.key, 'username', v)}
                          placeholder={brand.membershipOnly ? 'Membership # or ID' : 'Username or email'}
                          placeholderTextColor="#8FA8BF"
                          autoCapitalize="none"
                          style={{ ...INPUT_STYLE, marginBottom: 8 }}
                        />
                        {!brand.membershipOnly && (
                          <TextInput
                            value={cred?.password || ''}
                            onChangeText={(v) => updateCredential(brand.key, 'password', v)}
                            placeholder="Password"
                            placeholderTextColor="#8FA8BF"
                            secureTextEntry
                            autoCapitalize="none"
                            style={{ ...INPUT_STYLE, marginBottom: 8 }}
                          />
                        )}
                        {brand.key === 'instagram' && (
                          <TextInput
                            value={cred?.link || ''}
                            onChangeText={(v) => updateCredential(brand.key, 'link', v)}
                            placeholder="Profile URL (e.g. instagram.com/athlete)"
                            placeholderTextColor="#8FA8BF"
                            autoCapitalize="none"
                            keyboardType="url"
                            style={{ ...INPUT_STYLE, marginBottom: 8 }}
                          />
                        )}
                        <Pressable
                          style={{
                            backgroundColor: hasValue ? '#3B82B0' : '#D8E2EC',
                            borderRadius: 10,
                            paddingVertical: 10,
                            alignItems: 'center',
                            marginBottom: 8,
                            flexDirection: 'row',
                            justifyContent: 'center',
                            gap: 6,
                          }}
                          className="active:opacity-80"
                          onPress={() => toggleCredential(brand.key)}
                        >
                          <Ionicons name={hasValue ? 'checkmark' : 'chevron-up'} size={16} color={hasValue ? '#FEFEFE' : '#8FA8BF'} />
                          <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Bold', color: hasValue ? '#FEFEFE' : '#8FA8BF' }}>
                            {hasValue ? 'Save' : 'Done'}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <View style={{ marginTop: 'auto', paddingBottom: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                <DashboardButton onPress={handleFinish} saving={saving} />
                <SkipButton onPress={() => goTo(6)} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <BackButton onPress={() => goTo(4)} />
                <View style={{ flex: 1 }}>
                  <ContinueButton onPress={() => goTo(6)} />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ========== Step 6: Invite Guests ========== */}
        {step === 6 && (
          <View className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <StepHeader icon="heart" title="Invite Guests" subtitle="Keep family in the loop" />

              <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#4A6E8A', marginBottom: 16, lineHeight: 20 }}>
                Add people who need regular updates — grandparents, extended family, anyone who wants to know when and where the next tournament is.
              </Text>

              {guests.map((guest, i) => (
                <View key={i} style={{ backgroundColor: '#FEFEFE', borderWidth: 1.5, borderColor: '#D8E2EC', borderRadius: 20, padding: 16, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'NunitoSans-Bold', color: '#4A6E8A', letterSpacing: 1, textTransform: 'uppercase' }}>Guest {i + 1}</Text>
                    {guests.length > 1 && (
                      <Pressable onPress={() => setGuests(guests.filter((_, j) => j !== i))} className="active:opacity-70">
                        <Ionicons name="close-circle" size={20} color="#8FA8BF" />
                      </Pressable>
                    )}
                  </View>

                  <TextInput value={guest.name} onChangeText={(v) => { const u = [...guests]; u[i] = { ...u[i], name: v }; setGuests(u); }}
                    placeholder="Name (e.g. Grandma Sue)" placeholderTextColor="#8FA8BF" style={{ ...INPUT_STYLE, marginBottom: 8 }} />

                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    {RELATIONSHIP_OPTIONS.map((rel) => (
                      <Pressable key={rel} style={{
                        paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
                        backgroundColor: guest.relation === rel ? 'rgba(59,130,176,0.1)' : 'transparent',
                        borderWidth: 1.5, borderColor: guest.relation === rel ? '#3B82B0' : '#D8E2EC',
                      }} onPress={() => { const u = [...guests]; u[i] = { ...u[i], relation: rel }; setGuests(u); }}>
                        <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-SemiBold', color: guest.relation === rel ? '#3B82B0' : '#8FA8BF' }}>{rel}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <TextInput value={guest.phone} onChangeText={(v) => { const u = [...guests]; u[i] = { ...u[i], phone: v }; setGuests(u); }}
                    placeholder="Phone number (required for SMS updates)" placeholderTextColor="#8FA8BF" keyboardType="phone-pad"
                    style={{ ...INPUT_STYLE, borderColor: guest.name.trim() && !guest.phone.trim() ? '#ef4444' : '#D8E2EC' }} />
                  {guest.name.trim() && !guest.phone.trim() && (
                    <Text style={{ fontSize: 11, fontFamily: 'NunitoSans-SemiBold', color: '#fca5a5', marginTop: 4 }}>Phone required to send updates</Text>
                  )}
                </View>
              ))}

              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#D8E2EC', borderRadius: 20, marginBottom: 16 }}
                className="active:opacity-70"
                onPress={addGuest}
              >
                <Ionicons name="add-circle" size={20} color="#3B82B0" />
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#4A6E8A' }}>Add another guest</Text>
              </Pressable>
            </ScrollView>

            <View style={{ marginTop: 'auto', paddingBottom: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                <DashboardButton onPress={() => { if (validateGuests()) handleFinish(); }} saving={saving} />
                <SkipButton onPress={() => { setGuests([{ name: '', relation: 'Grandparent', phone: '' }]); goTo(7); }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <BackButton onPress={() => goTo(5)} />
                <View style={{ flex: 1 }}>
                  <ContinueButton onPress={() => { if (validateGuests()) goTo(7); }} />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ========== Step 7: Invite Co-Parent ========== */}
        {step === 7 && (
          <View className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="people" title="Co-Parent or Admin" subtitle="Add someone who helps manage" />

              <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#4A6E8A', marginBottom: 20, lineHeight: 20 }}>
                A co-parent or co-admin is someone who helps book travel or needs full visibility into tournament details.
              </Text>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F', marginBottom: 6 }}>Email</Text>
                <TextInput
                  value={coParentEmail}
                  onChangeText={setCoParentEmail}
                  placeholder="email@example.com"
                  placeholderTextColor="#8FA8BF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={INPUT_STYLE}
                />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F', marginBottom: 6 }}>Permission</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    style={{
                      flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
                      backgroundColor: coParentPermission === 'view' ? '#3B82B0' : '#FEFEFE',
                      borderWidth: 1.5, borderColor: coParentPermission === 'view' ? '#3B82B0' : '#D8E2EC',
                    }}
                    onPress={() => setCoParentPermission('view')}
                  >
                    <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: coParentPermission === 'view' ? '#FEFEFE' : '#8FA8BF' }}>View Only</Text>
                  </Pressable>
                  <Pressable
                    style={{
                      flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
                      backgroundColor: coParentPermission === 'manage' ? '#3B82B0' : '#FEFEFE',
                      borderWidth: 1.5, borderColor: coParentPermission === 'manage' ? '#3B82B0' : '#D8E2EC',
                    }}
                    onPress={() => setCoParentPermission('manage')}
                  >
                    <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: coParentPermission === 'manage' ? '#FEFEFE' : '#8FA8BF' }}>Full Access</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>

            <View style={{ marginTop: 'auto', paddingBottom: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                <DashboardButton onPress={handleFinish} saving={saving} />
                <SkipButton onPress={() => goTo(8)} />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <BackButton onPress={() => goTo(6)} />
                <View style={{ flex: 1 }}>
                  <ContinueButton onPress={() => goTo(8)} />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ========== Step 8: Invite Athlete ========== */}
        {step === 8 && (
          <View className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="person-add" title="Athlete Login" subtitle={`Give ${athleteName.trim() || 'your athlete'} access`} />

              <View style={{ backgroundColor: '#E8F4FF', borderWidth: 1.5, borderColor: '#B8D4EC', borderRadius: 20, padding: 20, marginBottom: 20 }}>
                <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F', marginBottom: 8 }}>
                  Want {athleteName.trim() || 'your athlete'} to have their own login?
                </Text>
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#4A6E8A', lineHeight: 20 }}>
                  They'll see their schedule, team info, and streaming links. They won't be able to edit travel or bookings.
                </Text>
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#1E3A5F', marginBottom: 6 }}>Athlete's Email</Text>
                <TextInput
                  value={athleteLoginEmail}
                  onChangeText={setAthleteLoginEmail}
                  placeholder="athlete@example.com"
                  placeholderTextColor="#8FA8BF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={INPUT_STYLE}
                />
              </View>
            </ScrollView>

            <View style={{ marginTop: 'auto', paddingBottom: 16, gap: 8 }}>
              {finishError ? (
                <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 14, padding: 12, marginBottom: 4, borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.3)' }}>
                  <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-SemiBold', color: '#fca5a5', textAlign: 'center' }}>{finishError}</Text>
                </View>
              ) : null}
              <ContinueButton
                onPress={() => { setFinishError(''); handleFinish(); }}
                label="Finish Setup"
                disabled={saving}
              />
              {!athleteLoginEmail.trim() && (
                <Pressable style={{ paddingVertical: 8, alignItems: 'center' }} className="active:opacity-70" onPress={() => { setFinishError(''); handleFinish(); }}>
                  <Text style={{ fontSize: 13, color: '#4A6E8A', fontFamily: 'NunitoSans-Regular' }}>Skip & Finish</Text>
                </Pressable>
              )}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <BackButton onPress={() => goTo(7)} />
                <View style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---- Mock travel extraction for dev mode ----
function mockExtractTravel(text: string) {
  const bookings: any[] = [];
  const hotelMatch = text.match(/(?:hotel|marriott|hilton|sheraton|hyatt|courtyard|residence inn)/i);
  const confirmMatch = text.match(/(?:confirmation|conf)[#:\s]*([A-Z0-9-]+)/i);
  const checkInMatch = text.match(/check[- ]?in[:\s]*(.+?)(?:\n|$)/i);
  const checkOutMatch = text.match(/check[- ]?out[:\s]*(.+?)(?:\n|$)/i);
  if (hotelMatch) {
    bookings.push({
      type: 'hotel', hotel_name: hotelMatch[0],
      reservation_number: confirmMatch?.[1] || '',
      check_in: checkInMatch?.[1]?.trim() || '', check_out: checkOutMatch?.[1]?.trim() || '',
      platform: 'Other', booking_name: '', booked_by: '', cost: null,
    });
  }
  const flightMatch = text.match(/(?:flight|airline|delta|southwest|american|united|jetblue)/i);
  const flightConfirmMatch = text.match(/(?:confirmation|conf)[:\s]*([A-Z0-9]+)/i);
  const departMatch = text.match(/depart[:\s]*(.+?)(?:\n|$)/i);
  const returnMatch = text.match(/return[:\s]*(.+?)(?:\n|$)/i);
  if (flightMatch) {
    bookings.push({
      type: 'flight', airline: flightMatch[0],
      confirmation_code: flightConfirmMatch?.[1] || '',
      departure_date: departMatch?.[1]?.trim() || '', return_date: returnMatch?.[1]?.trim() || '',
      booked_by: '', traveler_names: [], cost: null,
    });
  }
  return bookings;
}
