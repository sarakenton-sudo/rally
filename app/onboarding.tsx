import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  ActivityIndicator,
  Image,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useDataRefresh } from '@/providers/DataProvider';
import { useSeasonStore } from '@/stores/useSeasonStore';
import type { AdminConfig, Tournament, Athlete, Season } from '@/types/database';
import { smartExtract as smartExtractOnboarding } from '@/lib/schedule-parser';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SEASON_OPTIONS = ['2025-2026', '2026-2027'];
const TOTAL_STEPS = 8;

// ---- Shared components (outside main component to avoid re-creation) ----

function StepHeader({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color="#FEFEFE" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 24, fontFamily: 'Nunito-Black', color: '#FEFEFE' }}>{title}</Text>
        <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.6)' }}>{subtitle}</Text>
      </View>
    </View>
  );
}

function FieldLabel({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#FEFEFE', marginBottom: 6 }}>
      {label}{optional ? <Text style={{ fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.45)' }}> (optional)</Text> : ''}
    </Text>
  );
}

function NavButtons({ onBack, onNext, nextLabel = 'Continue', nextDisabled = false, showSkip = false, onSkip }: {
  onBack: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; showSkip?: boolean; onSkip?: () => void;
}) {
  return (
    <View style={{ marginTop: 'auto', paddingHorizontal: 8, paddingBottom: 16 }}>
      {showSkip && (
        <Pressable style={{ paddingVertical: 8, alignItems: 'center', marginBottom: 8 }} className="active:opacity-70" onPress={onSkip}>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: 'NunitoSans-Regular' }}>Skip for now</Text>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable
          style={{ paddingVertical: 16, paddingHorizontal: 24, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)' }}
          className="active:opacity-70"
          onPress={onBack}
        >
          <Ionicons name="arrow-back" size={20} color="#FEFEFE" />
        </Pressable>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: '#3B82B0',
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            opacity: nextDisabled ? 0.4 : 1,
            shadowColor: '#3B82B0',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.45,
            shadowRadius: 20,
            elevation: 6,
          }}
          className="active:opacity-80"
          onPress={onNext}
          disabled={nextDisabled}
        >
          <Text style={{ fontSize: 15, fontFamily: 'Nunito-ExtraBold', color: '#FEFEFE' }}>{nextLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function OptionCard({ icon, title, desc, selected, onPress, badge }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; desc: string; selected: boolean; onPress: () => void; badge?: string;
}) {
  return (
    <Pressable
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: selected ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)',
        backgroundColor: selected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
        marginBottom: 12,
      }}
      onPress={onPress}
    >
      <View style={{
        width: 44, height: 44, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: selected ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
      }}>
        <Ionicons name={icon} size={22} color={selected ? '#FEFEFE' : 'rgba(255,255,255,0.55)'} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-Bold', color: selected ? '#FEFEFE' : 'rgba(255,255,255,0.7)' }}>{title}</Text>
          {badge && (
            <View style={{ backgroundColor: 'rgba(251,146,60,0.25)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9, fontFamily: 'NunitoSans-Bold', color: '#FB923C', letterSpacing: 0.5 }}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: selected ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.35)', marginTop: 2 }}>{desc}</Text>
      </View>
      {selected && <Ionicons name="checkmark-circle" size={22} color="#6A9E8A" />}
    </Pressable>
  );
}

function SummaryRow({ icon, text, color }: { icon: keyof typeof Ionicons.glyphMap; text: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <Ionicons name={icon} size={18} color={color ?? '#FEFEFE'} />
      <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Regular', color: '#FEFEFE' }}>{text}</Text>
    </View>
  );
}

// Input style constants
const INPUT_STYLE = {
  backgroundColor: 'rgba(255,255,255,0.06)',
  borderWidth: 1.5,
  borderColor: 'rgba(255,255,255,0.12)',
  borderRadius: 14,
  paddingHorizontal: 16,
  paddingVertical: 12,
  fontSize: 15,
  color: '#FEFEFE',
  fontFamily: 'NunitoSans-Regular',
} as const;

// ---- Main Component ----

type GuestEntry = { name: string; relation: string; phone: string };

export default function OnboardingScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState(0);
  const { user } = useAuth();
  const { refresh } = useDataRefresh();

  // Step 1: Athlete
  const [athleteName, setAthleteName] = useState('');

  // Step 2: Season
  const [clubName, setClubName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [seasonYear, setSeasonYear] = useState(SEASON_OPTIONS[0]);
  const [teamCode, setTeamCode] = useState('');
  const [streamingUrl, setStreamingUrl] = useState('');

  // Step 3: Schedule
  const [pasteText, setPasteText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedTournaments, setExtractedTournaments] = useState<any[]>([]);
  const [extractError, setExtractError] = useState('');

  // Step 4: Email & Travel
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState('');
  const [trustedEmails, setTrustedEmails] = useState<string[]>([]);
  const [trustedEmailInput, setTrustedEmailInput] = useState('');

  // Step 5: Additional Athletes
  const [additionalAthletes, setAdditionalAthletes] = useState<{ firstName: string }[]>([]);

  // Step 6: Guests
  const [guests, setGuests] = useState<GuestEntry[]>([{ name: '', relation: 'Grandparent', phone: '' }]);

  const [saving, setSaving] = useState(false);

  const goTo = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setStep(index);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (page !== step) setStep(page);
  };

  // ---- Schedule extraction ----
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

  // ---- Gmail connect ----
  const handleConnectGmail = useCallback(async () => {
    if (!user || !GOOGLE_CLIENT_ID) return;
    setGmailConnecting(true);
    try {
      const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-auth-callback`;
      const isWeb = Platform.OS === 'web';
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID, redirect_uri: redirectUri, response_type: 'code',
        scope: 'https://www.googleapis.com/auth/gmail.readonly', access_type: 'offline', prompt: 'consent',
        state: isWeb ? `${user.id}|web` : user.id,
      });
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      if (isWeb) { window.location.href = authUrl; return; }
      const result = await WebBrowser.openAuthSessionAsync(authUrl, 'rally://auth/gmail-callback');
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        if (url.searchParams.get('success') === 'true') {
          setGmailConnected(true);
          setGmailEmail(url.searchParams.get('email') ?? '');
        }
      }
    } catch (err) { console.error('Gmail connect error:', err); }
    finally { setGmailConnecting(false); }
  }, [user]);

  // ---- Helpers ----
  const addTrustedEmail = () => {
    const email = trustedEmailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    if (!trustedEmails.includes(email)) setTrustedEmails([...trustedEmails, email]);
    setTrustedEmailInput('');
  };

  // ---- FINISH ----
  const handleFinish = async () => {
    if (!teamName.trim()) { Alert.alert('Team name required', 'Please go back and enter your team name.'); goTo(2); return; }
    setSaving(true);

    if (isSupabaseConfigured && user) {
      try {
        await supabase.from('user_profiles').upsert({ id: user.id, role: 'admin' }, { onConflict: 'id', ignoreDuplicates: true });

        const { data: athleteData, error: athleteError } = await supabase
          .from('athletes').insert({ first_name: athleteName.trim() || 'My Athlete', last_name: null, can_edit: false } as any).select().single();
        if (athleteError || !athleteData) throw new Error(athleteError?.message ?? 'Failed to create athlete');
        const athlete = athleteData as Athlete;

        await supabase.from('admin_athletes').insert({ admin_id: user.id, athlete_id: athlete.id, permission: 'manage', is_primary: true } as any);

        const { data: seasonData, error: seasonError } = await supabase
          .from('seasons').insert({
            athlete_id: athlete.id, team_name: teamName.trim(), club_name: clubName.trim() || null,
            season_year: seasonYear, team_code: teamCode.trim() || null, schedule_import_source: null,
            schedule_import_connected: false, is_active: true,
          } as any).select().single();
        if (seasonError || !seasonData) throw new Error(seasonError?.message ?? 'Failed to create season');
        const season = seasonData as Season;

        const { error: configError } = await supabase.from('admin_config').upsert({
          user_id: user.id, active_season_id: season.id, trusted_sender_emails: trustedEmails,
          default_stream_url: streamingUrl.trim() || null, gmail_connected: gmailConnected, gmail_email: gmailEmail || null,
        } as any, { onConflict: 'user_id' });
        if (configError) throw new Error(configError.message);

        if (extractedTournaments.length > 0) {
          await supabase.from('tournaments').insert(extractedTournaments.map((t) => ({
            season_id: season.id, name: t.name, start_date: t.start_date, end_date: t.end_date,
            location_city: t.location_city || null,
            venues: t.venue_name ? [{ label: t.venue_name, address: t.venue_address || '', is_confirmed: false }] : [],
            status: 'upcoming', travel_required: true,
          })) as any);
        }

        for (const extra of additionalAthletes) {
          if (!extra.firstName.trim()) continue;
          const { data: extraAthlete } = await supabase.from('athletes').insert({ first_name: extra.firstName.trim(), last_name: null, can_edit: false } as any).select().single();
          if (extraAthlete) {
            await supabase.from('admin_athletes').insert({ admin_id: user.id, athlete_id: (extraAthlete as Athlete).id, permission: 'manage', is_primary: true } as any);
          }
        }

        const validGuests = guests.filter((g) => g.name.trim());
        if (validGuests.length > 0) {
          await supabase.from('guests').insert(validGuests.map((g) => ({
            athlete_id: athlete.id, name: g.name.trim(), relationship: g.relation, phone: g.phone.trim() || null, notify_sms: !!g.phone.trim(),
          })) as any);
        }

        // Directly populate the store with the data we just created
        // (avoids race conditions with refresh/RLS on newly created rows)
        const store = useSeasonStore.getState();
        store.setAdminConfig({
          id: user.id, // admin_config uses user_id as effective key
          user_id: user.id,
          club_email_domain: null,
          rally_forward_address: 'plans@rally.app',
          trusted_sender_emails: trustedEmails,
          vip_sender_emails: [],
          notification_preferences: {
            tournament_reminders: true, cancellation_deadlines: true,
            email_arrivals: true, rsvp_responses: true, schedule_changes: true,
          },
          ical_feed_token: '',
          youtube_channel_id: null,
          default_streaming_platform: null,
          default_stream_url: streamingUrl.trim() || null,
          travel_sync_emails: [],
          gmail_connected: gmailConnected,
          gmail_email: gmailEmail || null,
          external_links: [],
          active_season_id: season.id,
          created_at: new Date().toISOString(),
        });
        store.setActiveSeasonId(season.id);
        store.setAthletes([athlete]);
        store.setSeasons([season]);
        store.setLoading(false);

        // Navigate immediately — refresh in background
        router.replace('/');
        refresh().catch(() => {});
      } catch (err: any) {
        setSaving(false);
        console.error('Onboarding error:', err);
        Alert.alert('Error', err.message ?? 'Something went wrong during setup.');
        return;
      }
    } else {
      const store = useSeasonStore.getState();
      const mockSeasonId = 'season-dev-001';
      const mockAthleteId = 'athlete-dev-001';
      store.setAdminConfig({
        id: 'onboarding-dev', user_id: 'dev', club_email_domain: null, rally_forward_address: 'plans@rally.app',
        trusted_sender_emails: trustedEmails, vip_sender_emails: [], notification_preferences: {
          tournament_reminders: true, cancellation_deadlines: true, email_arrivals: true, rsvp_responses: true, schedule_changes: true,
        }, ical_feed_token: '', youtube_channel_id: null, default_streaming_platform: null,
        default_stream_url: streamingUrl.trim() || null, travel_sync_emails: [], gmail_connected: false, gmail_email: null,
        external_links: [], active_season_id: mockSeasonId, created_at: new Date().toISOString(),
      });
      store.setAthletes([{ id: mockAthleteId, user_id: null, first_name: athleteName.trim() || 'My Athlete', last_name: null, can_edit: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
      store.setSeasons([{ id: mockSeasonId, athlete_id: mockAthleteId, team_name: teamName.trim(), club_name: clubName.trim() || null, season_year: seasonYear, sport: 'volleyball', team_code: teamCode.trim() || null, schedule_import_source: null, schedule_import_connected: false, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]);
      store.setActiveSeasonId(mockSeasonId);
      router.replace('/');
    }
    setSaving(false);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: '#1E3A5F' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        {/* Progress dots */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 16, paddingBottom: 8, gap: 8 }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={{
              borderRadius: 999,
              width: i === step ? 32 : 8,
              height: 8,
              backgroundColor: i === step ? '#3B82B0' : i < step ? 'rgba(59,130,176,0.5)' : 'rgba(255,255,255,0.12)',
            }} />
          ))}
        </View>

        {/* Pages */}
        <ScrollView
          ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16} onMomentumScrollEnd={handleScroll} scrollEnabled={false} keyboardShouldPersistTaps="handled"
        >
          {/* ===== Step 0: Welcome ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 justify-center items-center px-8">
            <Image source={require('@/assets/images/rallyhub_lockup_white.png')} style={{ width: 220, height: 64 }} resizeMode="contain" />
            <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 12, marginBottom: 8, maxWidth: 280, lineHeight: 22 }}>
              Your family's command center for travel volleyball. Let's get you set up — it only takes a minute.
            </Text>

            <View style={{ marginTop: 24, marginBottom: 40, gap: 14 }}>
              {[
                { icon: 'person' as const, text: 'Set up your athlete' },
                { icon: 'trophy' as const, text: 'Add your season & schedule' },
                { icon: 'mail' as const, text: 'Connect travel email' },
                { icon: 'heart' as const, text: 'Invite family' },
              ].map((item) => (
                <View key={item.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(59,130,176,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={item.icon} size={16} color="#7DBDD9" />
                  </View>
                  <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-SemiBold', color: 'rgba(255,255,255,0.8)' }}>{item.text}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={{
                backgroundColor: '#3B82B0', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 56,
                shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 6,
              }}
              className="active:opacity-80"
              onPress={() => goTo(1)}
            >
              <Text style={{ fontSize: 16, fontFamily: 'Nunito-ExtraBold', color: '#FEFEFE' }}>Let's Go</Text>
            </Pressable>
          </View>

          {/* ===== Step 1: Athlete ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="person" title="Your Athlete" subtitle="Who's playing?" />

              <View style={{ marginBottom: 16 }}>
                <FieldLabel label="Athlete's First Name" />
                <TextInput value={athleteName} onChangeText={setAthleteName} placeholder="e.g. Sophie" placeholderTextColor="rgba(255,255,255,0.3)" style={INPUT_STYLE} />
              </View>

              <View style={{ backgroundColor: 'rgba(59,130,176,0.1)', borderRadius: 20, padding: 16, borderWidth: 1.5, borderColor: 'rgba(59,130,176,0.2)' }}>
                <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.5)', lineHeight: 20 }}>
                  This is the player whose tournaments, travel, and schedule you'll be managing. You can add more players later.
                </Text>
              </View>
            </ScrollView>

            <NavButtons onBack={() => goTo(0)} onNext={() => {
              if (!athleteName.trim()) { Alert.alert('Name required', "Enter your athlete's first name."); return; }
              goTo(2);
            }} nextDisabled={!athleteName.trim()} />
          </View>

          {/* ===== Step 2: Season ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="trophy" title="Season Details" subtitle={`${athleteName.trim() || 'Your athlete'}'s team`} />

              <View style={{ marginBottom: 16 }}>
                <FieldLabel label="Club Name" />
                <TextInput value={clubName} onChangeText={setClubName} placeholder="e.g. Austin Juniors Volleyball" placeholderTextColor="rgba(255,255,255,0.3)" style={INPUT_STYLE} />
              </View>

              <View style={{ marginBottom: 16 }}>
                <FieldLabel label="Team Name" />
                <TextInput value={teamName} onChangeText={setTeamName} placeholder="e.g. AJV Travel 14u" placeholderTextColor="rgba(255,255,255,0.3)" style={INPUT_STYLE} />
              </View>

              <View style={{ marginBottom: 16 }}>
                <FieldLabel label="Season" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {SEASON_OPTIONS.map((opt) => (
                    <Pressable key={opt} style={{
                      flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center',
                      backgroundColor: seasonYear === opt ? '#3B82B0' : 'rgba(255,255,255,0.04)',
                      borderWidth: 1.5, borderColor: seasonYear === opt ? '#3B82B0' : 'rgba(255,255,255,0.12)',
                    }} onPress={() => setSeasonYear(opt)}>
                      <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: seasonYear === opt ? '#FEFEFE' : 'rgba(255,255,255,0.6)' }}>{opt}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ marginBottom: 16 }}>
                <FieldLabel label="Team Ticket Code" optional />
                <TextInput value={teamCode} onChangeText={setTeamCode} placeholder="e.g. AJV14U" placeholderTextColor="rgba(255,255,255,0.3)" autoCapitalize="characters" style={{ ...INPUT_STYLE, letterSpacing: 2 }} />
              </View>

              <View style={{ marginBottom: 16 }}>
                <FieldLabel label="Streaming URL" optional />
                <TextInput value={streamingUrl} onChangeText={setStreamingUrl} placeholder="e.g. https://youtube.com/@yourchannel" placeholderTextColor="rgba(255,255,255,0.3)" autoCapitalize="none" keyboardType="url" style={INPUT_STYLE} />
              </View>
            </ScrollView>

            <NavButtons onBack={() => goTo(1)} onNext={() => {
              if (!teamName.trim()) { Alert.alert('Team name required', 'Please enter your team name.'); return; }
              goTo(3);
            }} nextDisabled={!teamName.trim()} />
          </View>

          {/* ===== Step 3: Schedule Import ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="calendar" title="Tournament Schedule" subtitle="Add your upcoming tournaments" />

              <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
                Paste a coach message, email, or tournament list and we'll extract the details.
              </Text>

              <TextInput
                value={pasteText} onChangeText={setPasteText} multiline textAlignVertical="top"
                placeholder={"Paste schedule here...\n\ne.g. Lonestar Classic - Jan 17-19, 2026 - Dallas, TX"}
                placeholderTextColor="rgba(255,255,255,0.2)"
                style={{ ...INPUT_STYLE, minHeight: 120, marginBottom: 12, paddingTop: 12 }}
              />

              <Pressable
                style={{
                  borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginBottom: 16,
                  backgroundColor: isExtracting || !pasteText.trim() ? 'rgba(255,255,255,0.06)' : '#3B82B0',
                  shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: !pasteText.trim() ? 0 : 0.45, shadowRadius: 20,
                }}
                onPress={handleExtractSchedule} disabled={isExtracting || !pasteText.trim()}
              >
                {isExtracting ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color="#FEFEFE" />
                    <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: '#FEFEFE' }}>Extracting...</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: !pasteText.trim() ? 'rgba(255,255,255,0.2)' : '#FEFEFE' }}>Extract Tournaments</Text>
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
                    <View key={i} style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(106,158,138,0.2)', borderRadius: 14, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(106,158,138,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="trophy" size={18} color="#6A9E8A" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Bold', color: '#FEFEFE' }}>{t.name}</Text>
                        <Text style={{ fontSize: 11, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                          {t.start_date}{t.end_date !== t.start_date ? ` → ${t.end_date}` : ''}{t.location_city ? `  •  ${t.location_city}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="checkmark" size={16} color="#6A9E8A" />
                    </View>
                  ))}
                </View>
              )}

              {/* LeagueApps — Coming Soon */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 12, opacity: 0.4 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' }}>
                  <Ionicons name="globe" size={22} color="rgba(255,255,255,0.3)" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 15, fontFamily: 'NunitoSans-Bold', color: 'rgba(255,255,255,0.4)' }}>LeagueApps Import</Text>
                    <View style={{ backgroundColor: 'rgba(251,146,60,0.25)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 9, fontFamily: 'NunitoSans-Bold', color: '#FB923C', letterSpacing: 0.5 }}>COMING SOON</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>Auto-sync from LeagueApps</Text>
                </View>
              </View>
            </ScrollView>
            <NavButtons onBack={() => goTo(2)} onNext={() => goTo(4)} showSkip onSkip={() => goTo(4)} />
          </View>

          {/* ===== Step 4: Email & Travel ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="mail" title="Travel Email" subtitle="Auto-capture booking confirmations" />

              <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
                Connect Gmail to auto-detect hotel and flight confirmations. RALLY only reads — never sends.
              </Text>

              {gmailConnected ? (
                <View style={{ backgroundColor: 'rgba(106,158,138,0.15)', borderWidth: 1.5, borderColor: 'rgba(106,158,138,0.35)', borderRadius: 20, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name="checkmark-circle" size={24} color="#6A9E8A" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: '#FEFEFE' }}>Gmail Connected</Text>
                    {gmailEmail ? <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{gmailEmail}</Text> : null}
                  </View>
                </View>
              ) : (
                <Pressable
                  style={{
                    backgroundColor: '#FEFEFE', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 16,
                    flexDirection: 'row', justifyContent: 'center', gap: 8,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4,
                    opacity: gmailConnecting ? 0.6 : 1,
                  }}
                  onPress={handleConnectGmail} disabled={gmailConnecting}
                >
                  {gmailConnecting ? <ActivityIndicator size="small" color="#3B82B0" /> : <Ionicons name="logo-google" size={18} color="#4285F4" />}
                  <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: '#3a5a7a' }}>{gmailConnecting ? 'Connecting...' : 'Connect Gmail'}</Text>
                </Pressable>
              )}

              {/* Trusted sender emails */}
              <View style={{ marginTop: 8, marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: '#FEFEFE', marginBottom: 4 }}>Recognized Email Addresses</Text>
                <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.4)', marginBottom: 12, lineHeight: 20 }}>
                  Add other email addresses you might forward travel confirmations from (e.g. your work email).
                </Text>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <TextInput
                    value={trustedEmailInput} onChangeText={setTrustedEmailInput}
                    placeholder="work@company.com" placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="email-address" autoCapitalize="none"
                    style={{ ...INPUT_STYLE, flex: 1 }}
                    onSubmitEditing={addTrustedEmail} returnKeyType="done"
                  />
                  <Pressable style={{ backgroundColor: 'rgba(59,130,176,0.2)', borderRadius: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(59,130,176,0.3)' }} className="active:opacity-70" onPress={addTrustedEmail}>
                    <Ionicons name="add" size={20} color="#7DBDD9" />
                  </Pressable>
                </View>

                {trustedEmails.map((email) => (
                  <View key={email} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                    <Ionicons name="mail-outline" size={14} color="rgba(255,255,255,0.5)" />
                    <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#FEFEFE', flex: 1, marginLeft: 8 }}>{email}</Text>
                    <Pressable onPress={() => setTrustedEmails(trustedEmails.filter((e) => e !== email))} className="active:opacity-70" style={{ padding: 4 }}>
                      <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
            <NavButtons onBack={() => goTo(3)} onNext={() => goTo(5)} showSkip onSkip={() => goTo(5)} />
          </View>

          {/* ===== Step 5: Additional Athletes ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="people" title="More Athletes?" subtitle="Have another player? Add them here." />

              {/* Primary athlete card */}
              <View style={{ backgroundColor: 'rgba(106,158,138,0.1)', borderWidth: 1.5, borderColor: 'rgba(106,158,138,0.25)', borderRadius: 20, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="person-circle" size={28} color="#6A9E8A" />
                <View>
                  <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Bold', color: '#FEFEFE' }}>{athleteName.trim() || 'My Athlete'}</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.4)' }}>{teamName.trim()} • {seasonYear}</Text>
                </View>
              </View>

              {additionalAthletes.map((extra, i) => (
                <View key={i} style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: 16, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'NunitoSans-Bold', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase' }}>Player {i + 2}</Text>
                    <Pressable onPress={() => setAdditionalAthletes(additionalAthletes.filter((_, j) => j !== i))} className="active:opacity-70">
                      <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.4)" />
                    </Pressable>
                  </View>
                  <TextInput
                    value={extra.firstName} onChangeText={(v) => { const updated = [...additionalAthletes]; updated[i] = { firstName: v }; setAdditionalAthletes(updated); }}
                    placeholder="First name" placeholderTextColor="rgba(255,255,255,0.25)" style={INPUT_STYLE}
                  />
                  <Text style={{ fontSize: 11, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>You can set up their season details later in Settings.</Text>
                </View>
              ))}

              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.12)', borderRadius: 20, marginBottom: 16 }}
                className="active:opacity-70"
                onPress={() => setAdditionalAthletes([...additionalAthletes, { firstName: '' }])}
              >
                <Ionicons name="add-circle" size={20} color="rgba(255,255,255,0.5)" />
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: 'rgba(255,255,255,0.5)' }}>Add another player</Text>
              </Pressable>
            </ScrollView>
            <NavButtons onBack={() => goTo(4)} onNext={() => goTo(6)} showSkip onSkip={() => goTo(6)} />
          </View>

          {/* ===== Step 6: Guests ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <StepHeader icon="heart" title="Invite Family" subtitle="Who else follows along?" />

              <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
                Grandparents, co-parents, or anyone who needs the schedule. They'll get a read-only view — no app required.
              </Text>

              {guests.map((guest, i) => (
                <View key={i} style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: 16, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontFamily: 'NunitoSans-Bold', color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase' }}>Guest {i + 1}</Text>
                    {guests.length > 1 && (
                      <Pressable onPress={() => setGuests(guests.filter((_, j) => j !== i))} className="active:opacity-70">
                        <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.4)" />
                      </Pressable>
                    )}
                  </View>

                  <TextInput value={guest.name} onChangeText={(v) => { const u = [...guests]; u[i] = { ...u[i], name: v }; setGuests(u); }}
                    placeholder="Name (e.g. Grandma Sue)" placeholderTextColor="rgba(255,255,255,0.25)" style={{ ...INPUT_STYLE, marginBottom: 8 }} />

                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    {['Grandparent', 'Co-Parent', 'Family', 'Other'].map((rel) => (
                      <Pressable key={rel} style={{
                        paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
                        backgroundColor: guest.relation === rel ? 'rgba(59,130,176,0.2)' : 'transparent',
                        borderWidth: 1.5, borderColor: guest.relation === rel ? 'rgba(59,130,176,0.4)' : 'rgba(255,255,255,0.1)',
                      }} onPress={() => { const u = [...guests]; u[i] = { ...u[i], relation: rel }; setGuests(u); }}>
                        <Text style={{ fontSize: 12, fontFamily: 'NunitoSans-SemiBold', color: guest.relation === rel ? '#7DBDD9' : 'rgba(255,255,255,0.4)' }}>{rel}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <TextInput value={guest.phone} onChangeText={(v) => { const u = [...guests]; u[i] = { ...u[i], phone: v }; setGuests(u); }}
                    placeholder="Phone (optional, for SMS)" placeholderTextColor="rgba(255,255,255,0.25)" keyboardType="phone-pad" style={INPUT_STYLE} />
                </View>
              ))}

              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.12)', borderRadius: 20, marginBottom: 16 }}
                className="active:opacity-70"
                onPress={addGuest}
              >
                <Ionicons name="add-circle" size={20} color="rgba(255,255,255,0.5)" />
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: 'rgba(255,255,255,0.5)' }}>Add another guest</Text>
              </Pressable>
            </ScrollView>
            <NavButtons onBack={() => goTo(5)} onNext={() => goTo(7)} showSkip onSkip={() => { setGuests([{ name: '', relation: 'Grandparent', phone: '' }]); goTo(7); }} />
          </View>

          {/* ===== Step 7: All Set ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 justify-center items-center px-8">
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(106,158,138,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
              <Ionicons name="checkmark-circle" size={52} color="#6A9E8A" />
            </View>
            <Text style={{ fontSize: 28, fontFamily: 'Nunito-Black', color: '#FEFEFE', textAlign: 'center', marginBottom: 12 }}>You're all set!</Text>
            <Text style={{ fontSize: 14, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.6)', textAlign: 'center', maxWidth: 280, lineHeight: 22 }}>
              {teamName.trim() || 'Your team'} is ready to go.{athleteName.trim() ? ` Let's have a great season, ${athleteName.trim()}!` : ''}
            </Text>

            {/* Summary card */}
            <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 20, width: '100%', maxWidth: 340, marginTop: 16, marginBottom: 32 }}>
              <SummaryRow icon="person" text={athleteName.trim() || 'My Athlete'} />
              <SummaryRow icon="people" text={teamName.trim() || '—'} />
              <SummaryRow icon="calendar" text={seasonYear} />
              {teamCode.trim() ? <SummaryRow icon="key" text={teamCode.trim()} /> : null}
              {extractedTournaments.length > 0 && <SummaryRow icon="checkmark-circle" text={`${extractedTournaments.length} tournament${extractedTournaments.length !== 1 ? 's' : ''} ready`} color="#6A9E8A" />}
              {gmailConnected && <SummaryRow icon="checkmark-circle" text={`Gmail: ${gmailEmail || 'connected'}`} color="#6A9E8A" />}
              {trustedEmails.length > 0 && <SummaryRow icon="checkmark-circle" text={`${trustedEmails.length} trusted email${trustedEmails.length !== 1 ? 's' : ''}`} color="#6A9E8A" />}
              {additionalAthletes.filter((a) => a.firstName.trim()).length > 0 && <SummaryRow icon="checkmark-circle" text={`${additionalAthletes.filter((a) => a.firstName.trim()).length} additional player${additionalAthletes.filter((a) => a.firstName.trim()).length !== 1 ? 's' : ''}`} color="#6A9E8A" />}
              {guests.some((g) => g.name.trim()) && <SummaryRow icon="checkmark-circle" text={`${guests.filter((g) => g.name.trim()).length} guest${guests.filter((g) => g.name.trim()).length !== 1 ? 's' : ''} invited`} color="#6A9E8A" />}
            </View>

            <View style={{ width: '100%', maxWidth: 340, gap: 12 }}>
              <Pressable
                style={{
                  backgroundColor: '#3B82B0', borderRadius: 14, paddingVertical: 16, alignItems: 'center',
                  shadowColor: '#3B82B0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 20, elevation: 6,
                  opacity: saving ? 0.6 : 1,
                }}
                className="active:opacity-80"
                onPress={handleFinish} disabled={saving}
              >
                {saving ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color="#FEFEFE" />
                    <Text style={{ fontSize: 15, fontFamily: 'Nunito-ExtraBold', color: '#FEFEFE' }}>Setting up...</Text>
                  </View>
                ) : (
                  <Text style={{ fontSize: 15, fontFamily: 'Nunito-ExtraBold', color: '#FEFEFE' }}>Open My Dashboard</Text>
                )}
              </Pressable>
              <Pressable style={{ paddingVertical: 12, alignItems: 'center' }} className="active:opacity-70" onPress={() => goTo(1)}>
                <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: 'rgba(255,255,255,0.5)' }}>Go back and edit</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
