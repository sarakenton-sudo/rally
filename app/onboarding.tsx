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
  const [guests, setGuests] = useState<GuestEntry[]>([
    { name: '', relation: 'Grandparent', phone: '' },
  ]);

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
    setIsExtracting(true);
    setExtractError('');
    setExtractedTournaments([]);
    try {
      let tournaments: any[] = [];
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/extract-schedule`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'apikey': SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ text: trimmed }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const data = await resp.json();
          if (resp.ok && data.tournaments?.length > 0) tournaments = data.tournaments;
        } catch (e) { console.warn('AI extraction failed:', e); }
      }
      if (tournaments.length === 0) tournaments = smartExtractOnboarding(trimmed);
      if (tournaments.length === 0) {
        setExtractError('Could not find any tournaments. Try a different format.');
      } else {
        setExtractedTournaments(tournaments);
      }
    } catch (err: any) {
      setExtractError(err.message || 'Something went wrong.');
    } finally {
      setIsExtracting(false);
    }
  };

  // ---- Gmail connect ----
  const handleConnectGmail = useCallback(async () => {
    if (!user || !GOOGLE_CLIENT_ID) return;
    setGmailConnecting(true);
    try {
      const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-auth-callback`;
      const isWeb = Platform.OS === 'web';
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
        access_type: 'offline',
        prompt: 'consent',
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
    } catch (err) {
      console.error('Gmail connect error:', err);
    } finally {
      setGmailConnecting(false);
    }
  }, [user]);

  // ---- Trusted email helpers ----
  const addTrustedEmail = () => {
    const email = trustedEmailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    if (!trustedEmails.includes(email)) {
      setTrustedEmails([...trustedEmails, email]);
    }
    setTrustedEmailInput('');
  };

  const removeTrustedEmail = (email: string) => {
    setTrustedEmails(trustedEmails.filter((e) => e !== email));
  };

  // ---- Additional athlete helpers ----
  const addAthlete = () => {
    setAdditionalAthletes([...additionalAthletes, { firstName: '' }]);
  };

  const updateAdditionalAthlete = (index: number, name: string) => {
    const updated = [...additionalAthletes];
    updated[index] = { firstName: name };
    setAdditionalAthletes(updated);
  };

  const removeAdditionalAthlete = (index: number) => {
    setAdditionalAthletes(additionalAthletes.filter((_, i) => i !== index));
  };

  // ---- Guest helpers ----
  const addGuest = () => {
    setGuests([...guests, { name: '', relation: 'Grandparent', phone: '' }]);
  };

  const updateGuest = (index: number, field: keyof GuestEntry, value: string) => {
    const updated = [...guests];
    updated[index] = { ...updated[index], [field]: value };
    setGuests(updated);
  };

  const removeGuest = (index: number) => {
    if (guests.length <= 1) return;
    setGuests(guests.filter((_, i) => i !== index));
  };

  // ---- FINISH ----
  const handleFinish = async () => {
    if (!teamName.trim()) {
      Alert.alert('Team name required', 'Please go back and enter your team name.');
      goTo(2);
      return;
    }

    setSaving(true);

    if (isSupabaseConfigured && user) {
      try {
        // 0. Ensure user_profiles row exists
        await supabase
          .from('user_profiles')
          .upsert({ id: user.id, role: 'admin' }, { onConflict: 'id', ignoreDuplicates: true });

        // 1. Create primary athlete
        const { data: athleteData, error: athleteError } = await supabase
          .from('athletes')
          .insert({
            first_name: athleteName.trim() || 'My Athlete',
            last_name: null,
            can_edit: false,
          } as any)
          .select()
          .single();

        if (athleteError || !athleteData) {
          throw new Error(athleteError?.message ?? 'Failed to create athlete');
        }
        const athlete = athleteData as Athlete;

        // 2. Create admin_athletes link
        await supabase
          .from('admin_athletes')
          .insert({
            admin_id: user.id,
            athlete_id: athlete.id,
            permission: 'manage',
            is_primary: true,
          } as any);

        // 3. Create season
        const { data: seasonData, error: seasonError } = await supabase
          .from('seasons')
          .insert({
            athlete_id: athlete.id,
            team_name: teamName.trim(),
            club_name: clubName.trim() || null,
            season_year: seasonYear,
            team_code: teamCode.trim() || null,
            schedule_import_source: null,
            schedule_import_connected: false,
            is_active: true,
          } as any)
          .select()
          .single();

        if (seasonError || !seasonData) {
          throw new Error(seasonError?.message ?? 'Failed to create season');
        }
        const season = seasonData as Season;

        // 4. Create admin_config
        const { error: configError } = await supabase
          .from('admin_config')
          .upsert({
            user_id: user.id,
            active_season_id: season.id,
            trusted_sender_emails: trustedEmails,
            default_stream_url: streamingUrl.trim() || null,
            gmail_connected: gmailConnected,
            gmail_email: gmailEmail || null,
          } as any, { onConflict: 'user_id' });

        if (configError) {
          throw new Error(configError.message);
        }

        // 5. Save extracted tournaments
        if (extractedTournaments.length > 0) {
          await supabase.from('tournaments').insert(
            extractedTournaments.map((t) => ({
              season_id: season.id,
              name: t.name,
              start_date: t.start_date,
              end_date: t.end_date,
              location_city: t.location_city || null,
              venues: t.venue_name ? [{ label: t.venue_name, address: t.venue_address || '', is_confirmed: false }] : [],
              status: 'upcoming',
              travel_required: true,
            })) as any
          );
        }

        // 6. Create additional athletes
        for (const extra of additionalAthletes) {
          if (!extra.firstName.trim()) continue;
          const { data: extraAthlete } = await supabase
            .from('athletes')
            .insert({
              first_name: extra.firstName.trim(),
              last_name: null,
              can_edit: false,
            } as any)
            .select()
            .single();

          if (extraAthlete) {
            await supabase
              .from('admin_athletes')
              .insert({
                admin_id: user.id,
                athlete_id: (extraAthlete as Athlete).id,
                permission: 'manage',
                is_primary: true,
              } as any);
          }
        }

        // 7. Create guests
        const validGuests = guests.filter((g) => g.name.trim());
        if (validGuests.length > 0) {
          await supabase.from('guests').insert(
            validGuests.map((g) => ({
              athlete_id: athlete.id,
              name: g.name.trim(),
              relationship: g.relation,
              phone: g.phone.trim() || null,
              notify_sms: !!g.phone.trim(),
            })) as any
          );
        }

        // 8. Re-fetch all data so the store is populated from DB
        await refresh();

        // 9. Navigate to dashboard
        router.replace('/');
      } catch (err: any) {
        setSaving(false);
        console.error('Onboarding error:', err);
        Alert.alert('Error', err.message ?? 'Something went wrong during setup.');
        return;
      }
    } else {
      // Dev mode — set mock data
      const mockSeasonId = 'season-dev-001';
      const mockAthleteId = 'athlete-dev-001';
      const store = useSeasonStore.getState();
      store.setAdminConfig({
        id: 'onboarding-dev',
        user_id: 'dev',
        club_email_domain: null,
        rally_forward_address: 'plans@rally.app',
        trusted_sender_emails: trustedEmails,
        vip_sender_emails: [],
        notification_preferences: {
          tournament_reminders: true,
          cancellation_deadlines: true,
          email_arrivals: true,
          rsvp_responses: true,
          schedule_changes: true,
        },
        ical_feed_token: '',
        youtube_channel_id: null,
        default_streaming_platform: null,
        default_stream_url: streamingUrl.trim() || null,
        travel_sync_emails: [],
        gmail_connected: false,
        gmail_email: null,
        external_links: [],
        active_season_id: mockSeasonId,
        created_at: new Date().toISOString(),
      });
      store.setAthletes([{
        id: mockAthleteId,
        user_id: null,
        first_name: athleteName.trim() || 'My Athlete',
        last_name: null,
        can_edit: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]);
      store.setSeasons([{
        id: mockSeasonId,
        athlete_id: mockAthleteId,
        team_name: teamName.trim(),
        club_name: clubName.trim() || null,
        season_year: seasonYear,
        sport: 'volleyball',
        team_code: teamCode.trim() || null,
        schedule_import_source: null,
        schedule_import_connected: false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]);
      store.setActiveSeasonId(mockSeasonId);
      router.replace('/');
    }

    setSaving(false);
  };

  // ---- Shared Components ----
  const NavButtons = ({ onBack, onNext, nextLabel = 'Continue', nextDisabled = false, showSkip = false, onSkip }: {
    onBack: () => void;
    onNext: () => void;
    nextLabel?: string;
    nextDisabled?: boolean;
    showSkip?: boolean;
    onSkip?: () => void;
  }) => (
    <View className="mt-auto px-2 pb-4">
      {showSkip && (
        <Pressable className="py-2 items-center mb-2 active:opacity-70" onPress={onSkip}>
          <Text className="text-sm text-cream/70">Skip for now</Text>
        </Pressable>
      )}
      <View className="flex-row gap-3">
        <Pressable
          className="py-4 px-6 rounded-2xl border border-cream/20 active:opacity-70"
          onPress={onBack}
        >
          <Ionicons name="arrow-back" size={20} color="#FFF8F0" />
        </Pressable>
        <Pressable
          className={`flex-1 bg-cream rounded-2xl py-4 items-center active:opacity-80 ${nextDisabled ? 'opacity-40' : ''}`}
          onPress={onNext}
          disabled={nextDisabled}
        >
          <Text className="text-base font-bold text-rally-600">{nextLabel}</Text>
        </Pressable>
      </View>
    </View>
  );

  const OptionCard = ({ icon, title, desc, selected, onPress, badge }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    desc: string;
    selected: boolean;
    onPress: () => void;
    badge?: string;
  }) => (
    <Pressable
      className={`flex-row items-center gap-4 p-4 rounded-2xl border mb-3 ${
        selected ? 'bg-cream/20 border-cream/60' : 'bg-white/10 border-cream/30'
      }`}
      onPress={onPress}
    >
      <View className={`w-11 h-11 rounded-xl items-center justify-center ${selected ? 'bg-cream/25' : 'bg-white/10'}`}>
        <Ionicons name={icon} size={22} color={selected ? '#FFF8F0' : 'rgba(255,248,240,0.7)'} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className={`text-base font-bold ${selected ? 'text-cream' : 'text-cream/80'}`}>{title}</Text>
          {badge && (
            <View className="bg-amber-400/30 rounded px-1.5 py-0.5">
              <Text className="text-[10px] font-bold text-amber-300">{badge}</Text>
            </View>
          )}
        </View>
        <Text className={`text-sm mt-0.5 ${selected ? 'text-cream/60' : 'text-cream/50'}`}>{desc}</Text>
      </View>
      {selected && <Ionicons name="checkmark-circle" size={22} color="#6A9E8A" />}
    </Pressable>
  );

  const StepHeader = ({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) => (
    <View className="flex-row items-center gap-3 mb-5">
      <View className="w-10 h-10 rounded-xl bg-cream/10 items-center justify-center">
        <Ionicons name={icon} size={22} color="#FFF8F0" />
      </View>
      <View>
        <Text className="text-2xl font-nunito-black text-cream">{title}</Text>
        <Text className="text-sm text-cream/70">{subtitle}</Text>
      </View>
    </View>
  );

  const FieldInput = ({ label, value, onChangeText, placeholder, optional, ...props }: {
    label: string; value: string; onChangeText: (t: string) => void; placeholder: string; optional?: boolean;
    [k: string]: any;
  }) => (
    <View className="mb-4">
      <Text className="text-sm font-semibold text-cream mb-1.5">
        {label}{optional ? <Text className="text-cream/60 font-normal"> (optional)</Text> : ''}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.4)"
        className="bg-white/10 border border-cream/20 rounded-xl px-4 py-3 text-base text-cream"
        {...props}
      />
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-rally-600">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Progress dots */}
        <View className="flex-row justify-center items-center pt-4 pb-2 gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              className={`rounded-full ${
                i === step ? 'w-8 h-2 bg-cream' : i < step ? 'w-2 h-2 bg-cream/60' : 'w-2 h-2 bg-cream/20'
              }`}
            />
          ))}
        </View>

        {/* Pages */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={handleScroll}
          scrollEnabled={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ===== Step 0: Welcome ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 justify-center items-center px-8">
            <Image
              source={require('@/assets/images/rallyhub_lockup_white.png')}
              style={{ width: 240, height: 80 }}
              resizeMode="contain"
              className="mb-8"
            />
            <Text className="text-base text-cream text-center mb-2 max-w-xs leading-6">
              Your family's command center for travel volleyball. Let's get you set up — it only takes a minute.
            </Text>

            <View className="mt-6 mb-10 gap-3">
              {[
                { icon: 'person' as const, text: 'Set up your athlete' },
                { icon: 'trophy' as const, text: 'Add your season & schedule' },
                { icon: 'mail' as const, text: 'Connect travel email' },
                { icon: 'heart' as const, text: 'Invite family' },
              ].map((item) => (
                <View key={item.text} className="flex-row items-center gap-3">
                  <Ionicons name={item.icon} size={16} color="#FFF8F0" />
                  <Text className="text-sm text-cream">{item.text}</Text>
                </View>
              ))}
            </View>

            <Pressable
              className="bg-cream rounded-2xl py-4 px-14 active:opacity-80"
              onPress={() => goTo(1)}
            >
              <Text className="text-base font-bold text-rally-600">Let's Go</Text>
            </Pressable>
          </View>

          {/* ===== Step 1: Athlete ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="person" title="Your Athlete" subtitle="Who's playing?" />

              <FieldInput
                label="Athlete's First Name"
                value={athleteName}
                onChangeText={setAthleteName}
                placeholder="e.g. Sophie"
              />

              <View className="bg-cream/10 rounded-2xl p-4 mt-2">
                <Text className="text-xs text-cream/60 leading-5">
                  This is the player whose tournaments, travel, and schedule you'll be managing. You can add more players later.
                </Text>
              </View>
            </ScrollView>

            <NavButtons
              onBack={() => goTo(0)}
              onNext={() => {
                if (!athleteName.trim()) {
                  Alert.alert('Name required', "Enter your athlete's first name.");
                  return;
                }
                goTo(2);
              }}
              nextDisabled={!athleteName.trim()}
            />
          </View>

          {/* ===== Step 2: Season ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="trophy" title="Season Details" subtitle={`${athleteName.trim() || 'Your athlete'}'s team`} />

              <FieldInput
                label="Club Name"
                value={clubName}
                onChangeText={setClubName}
                placeholder="e.g. Austin Juniors Volleyball"
              />

              <FieldInput
                label="Team Name"
                value={teamName}
                onChangeText={setTeamName}
                placeholder="e.g. AJV Travel 14u"
              />

              <View className="mb-4">
                <Text className="text-sm font-semibold text-cream mb-1.5">Season</Text>
                <View className="flex-row gap-2">
                  {SEASON_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt}
                      className={`flex-1 py-3 rounded-xl items-center border ${
                        seasonYear === opt ? 'bg-cream border-cream' : 'bg-white/5 border-cream/20'
                      }`}
                      onPress={() => setSeasonYear(opt)}
                    >
                      <Text className={`text-sm font-bold ${seasonYear === opt ? 'text-rally-600' : 'text-cream'}`}>{opt}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <FieldInput
                label="Team Ticket Code"
                value={teamCode}
                onChangeText={setTeamCode}
                placeholder="e.g. AJV14U"
                optional
                autoCapitalize="characters"
                style={{ letterSpacing: 2 }}
              />

              <FieldInput
                label="Streaming URL"
                value={streamingUrl}
                onChangeText={setStreamingUrl}
                placeholder="e.g. https://youtube.com/@yourchannel"
                optional
                autoCapitalize="none"
                keyboardType="url"
              />
            </ScrollView>

            <NavButtons
              onBack={() => goTo(1)}
              onNext={() => {
                if (!teamName.trim()) {
                  Alert.alert('Team name required', 'Please enter your team name.');
                  return;
                }
                goTo(3);
              }}
              nextDisabled={!teamName.trim()}
            />
          </View>

          {/* ===== Step 3: Schedule Import ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="calendar" title="Tournament Schedule" subtitle="Add your upcoming tournaments" />

              <Text className="text-sm text-cream/60 mb-4">
                Paste a coach message, email, or tournament list and we'll extract the details.
              </Text>

              <TextInput
                value={pasteText}
                onChangeText={setPasteText}
                multiline
                textAlignVertical="top"
                placeholder={"Paste schedule here...\n\ne.g. Lonestar Classic - Jan 17-19, 2026 - Dallas, TX"}
                placeholderTextColor="rgba(255,255,255,0.2)"
                className="bg-white/10 border border-cream/20 rounded-xl px-4 py-3 text-sm text-cream min-h-[120px] mb-3"
              />

              <Pressable
                className={`rounded-xl py-3 items-center mb-4 ${
                  isExtracting || !pasteText.trim() ? 'bg-cream/10' : 'bg-cream active:opacity-80'
                }`}
                onPress={handleExtractSchedule}
                disabled={isExtracting || !pasteText.trim()}
              >
                {isExtracting ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#3B82B0" />
                    <Text className="text-sm font-bold text-rally-600">Extracting...</Text>
                  </View>
                ) : (
                  <Text className={`text-sm font-bold ${!pasteText.trim() ? 'text-cream/30' : 'text-rally-600'}`}>
                    Extract Tournaments
                  </Text>
                )}
              </Pressable>

              {extractError ? (
                <View className="bg-red-500/20 rounded-xl p-3 mb-3">
                  <Text className="text-xs text-red-300 text-center font-semibold">{extractError}</Text>
                </View>
              ) : null}

              {extractedTournaments.length > 0 && (
                <View className="bg-teal/10 border-2 border-teal/40 rounded-2xl p-4 mb-4">
                  <View className="flex-row items-center gap-2 mb-3">
                    <Ionicons name="checkmark-circle" size={22} color="#6A9E8A" />
                    <Text className="text-base font-bold text-teal">
                      {extractedTournaments.length} tournament{extractedTournaments.length !== 1 ? 's' : ''} found!
                    </Text>
                  </View>
                  {extractedTournaments.map((t, i) => (
                    <View key={i} className="bg-white/10 border border-teal/25 rounded-xl p-3 mb-2 flex-row items-center gap-3">
                      <View className="w-9 h-9 rounded-lg bg-teal/20 items-center justify-center">
                        <Ionicons name="trophy" size={18} color="#6A9E8A" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-cream">{t.name}</Text>
                        <Text className="text-xs text-cream/60 mt-0.5">
                          {t.start_date}{t.end_date !== t.start_date ? ` → ${t.end_date}` : ''}
                          {t.location_city ? `  •  ${t.location_city}` : ''}
                        </Text>
                      </View>
                      <Ionicons name="checkmark" size={16} color="#6A9E8A" />
                    </View>
                  ))}
                </View>
              )}

              {/* LeagueApps - Coming Soon */}
              <View className="flex-row items-center gap-4 p-4 rounded-2xl border border-cream/15 mb-3 opacity-50">
                <View className="w-11 h-11 rounded-xl items-center justify-center bg-white/5">
                  <Ionicons name="globe" size={22} color="rgba(255,248,240,0.4)" />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base font-bold text-cream/50">LeagueApps Import</Text>
                    <View className="bg-amber-400/30 rounded px-1.5 py-0.5">
                      <Text className="text-[10px] font-bold text-amber-300">COMING SOON</Text>
                    </View>
                  </View>
                  <Text className="text-sm mt-0.5 text-cream/30">Auto-sync from LeagueApps</Text>
                </View>
              </View>
            </ScrollView>

            <NavButtons
              onBack={() => goTo(2)}
              onNext={() => goTo(4)}
              showSkip
              onSkip={() => goTo(4)}
            />
          </View>

          {/* ===== Step 4: Email & Travel ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="mail" title="Travel Email" subtitle="Auto-capture booking confirmations" />

              <Text className="text-sm text-cream/60 mb-4">
                Connect Gmail to auto-detect hotel and flight confirmations. RALLY only reads — never sends.
              </Text>

              {/* Gmail connect */}
              {gmailConnected ? (
                <View className="bg-teal/20 border border-teal/40 rounded-2xl p-4 mb-4 flex-row items-center gap-3">
                  <Ionicons name="checkmark-circle" size={24} color="#6A9E8A" />
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-cream">Gmail Connected</Text>
                    {gmailEmail ? <Text className="text-xs text-cream/60 mt-0.5">{gmailEmail}</Text> : null}
                  </View>
                </View>
              ) : (
                <Pressable
                  className={`rounded-2xl py-3.5 items-center mb-4 border ${
                    gmailConnecting ? 'bg-cream/10 border-cream/20' : 'bg-cream border-cream active:opacity-80'
                  }`}
                  onPress={handleConnectGmail}
                  disabled={gmailConnecting}
                >
                  <View className="flex-row items-center gap-2">
                    {gmailConnecting ? (
                      <ActivityIndicator size="small" color="#3B82B0" />
                    ) : (
                      <Ionicons name="logo-google" size={18} color="#3B82B0" />
                    )}
                    <Text className={`text-sm font-bold ${gmailConnecting ? 'text-cream/40' : 'text-rally-600'}`}>
                      {gmailConnecting ? 'Connecting...' : 'Connect Gmail'}
                    </Text>
                  </View>
                </Pressable>
              )}

              {/* Trusted sender emails */}
              <View className="mt-2 mb-4">
                <Text className="text-sm font-semibold text-cream mb-1">Recognized Email Addresses</Text>
                <Text className="text-xs text-cream/50 mb-3 leading-5">
                  Add other email addresses you might forward travel confirmations from (e.g. your work email). RALLY will recognize and process forwarded receipts from these.
                </Text>

                <View className="flex-row gap-2 mb-2">
                  <TextInput
                    value={trustedEmailInput}
                    onChangeText={setTrustedEmailInput}
                    placeholder="work@company.com"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    className="flex-1 bg-white/10 border border-cream/20 rounded-xl px-4 py-2.5 text-sm text-cream"
                    onSubmitEditing={addTrustedEmail}
                    returnKeyType="done"
                  />
                  <Pressable
                    className="bg-cream/20 rounded-xl px-4 items-center justify-center active:opacity-70"
                    onPress={addTrustedEmail}
                  >
                    <Ionicons name="add" size={20} color="#FFF8F0" />
                  </Pressable>
                </View>

                {trustedEmails.map((email) => (
                  <View key={email} className="flex-row items-center bg-cream/10 rounded-lg px-3 py-2 mb-1.5">
                    <Ionicons name="mail-outline" size={14} color="rgba(255,248,240,0.6)" />
                    <Text className="text-sm text-cream flex-1 ml-2">{email}</Text>
                    <Pressable onPress={() => removeTrustedEmail(email)} className="active:opacity-70 p-1">
                      <Ionicons name="close-circle" size={18} color="rgba(255,248,240,0.5)" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>

            <NavButtons
              onBack={() => goTo(3)}
              onNext={() => goTo(5)}
              showSkip
              onSkip={() => goTo(5)}
            />
          </View>

          {/* ===== Step 5: Additional Athletes ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <StepHeader icon="people" title="More Athletes?" subtitle="Have another player? Add them here." />

              {/* Primary athlete card */}
              <View className="bg-teal/15 border border-teal/30 rounded-2xl p-4 mb-4 flex-row items-center gap-3">
                <Ionicons name="person-circle" size={28} color="#6A9E8A" />
                <View>
                  <Text className="text-sm font-bold text-cream">{athleteName.trim() || 'My Athlete'}</Text>
                  <Text className="text-xs text-cream/50">{teamName.trim()} • {seasonYear}</Text>
                </View>
              </View>

              {/* Additional athletes */}
              {additionalAthletes.map((extra, i) => (
                <View key={i} className="bg-white/10 border border-cream/30 rounded-2xl p-4 mb-3">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-sm text-cream/70 uppercase tracking-wider font-bold">Player {i + 2}</Text>
                    <Pressable onPress={() => removeAdditionalAthlete(i)} className="active:opacity-70">
                      <Ionicons name="close-circle" size={20} color="rgba(255,248,240,0.6)" />
                    </Pressable>
                  </View>
                  <TextInput
                    value={extra.firstName}
                    onChangeText={(v) => updateAdditionalAthlete(i, v)}
                    placeholder="First name"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    className="bg-white/10 border border-cream/30 rounded-xl px-4 py-3 text-sm text-cream"
                  />
                  <Text className="text-xs text-cream/40 mt-2">
                    You can set up their season details later in Settings.
                  </Text>
                </View>
              ))}

              <Pressable
                className="flex-row items-center justify-center gap-2 py-3 border border-dashed border-cream/20 rounded-2xl active:opacity-70 mb-4"
                onPress={addAthlete}
              >
                <Ionicons name="add-circle" size={20} color="rgba(255,248,240,0.7)" />
                <Text className="text-sm text-cream/70 font-semibold">Add another player</Text>
              </Pressable>

              <View className="bg-cream/10 rounded-2xl p-4">
                <Text className="text-xs text-cream/50 leading-5">
                  Each player gets their own season, schedule, and travel tracking. You can manage all of them from one account.
                </Text>
              </View>
            </ScrollView>

            <NavButtons
              onBack={() => goTo(4)}
              onNext={() => goTo(6)}
              showSkip
              onSkip={() => goTo(6)}
            />
          </View>

          {/* ===== Step 6: Guests ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <StepHeader icon="heart" title="Invite Family" subtitle="Who else follows along?" />

              <Text className="text-sm text-cream/60 mb-4">
                Grandparents, co-parents, or anyone who needs the schedule. They'll get a read-only view — no app required.
              </Text>

              {guests.map((guest, i) => (
                <View key={i} className="bg-white/10 border border-cream/30 rounded-2xl p-4 mb-3">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-sm text-cream/70 uppercase tracking-wider font-bold">Guest {i + 1}</Text>
                    {guests.length > 1 && (
                      <Pressable onPress={() => removeGuest(i)} className="active:opacity-70">
                        <Ionicons name="close-circle" size={20} color="rgba(255,248,240,0.6)" />
                      </Pressable>
                    )}
                  </View>

                  <TextInput
                    value={guest.name}
                    onChangeText={(v) => updateGuest(i, 'name', v)}
                    placeholder="Name (e.g. Grandma Sue)"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    className="bg-white/10 border border-cream/30 rounded-xl px-4 py-3 text-sm text-cream mb-2"
                  />

                  <View className="flex-row gap-2 mb-2 flex-wrap">
                    {['Grandparent', 'Co-Parent', 'Family', 'Other'].map((rel) => (
                      <Pressable
                        key={rel}
                        className={`py-2 px-3 rounded-lg border ${
                          guest.relation === rel ? 'bg-cream/20 border-cream/50' : 'border-cream/25'
                        }`}
                        onPress={() => updateGuest(i, 'relation', rel)}
                      >
                        <Text className={`text-xs font-semibold ${guest.relation === rel ? 'text-cream' : 'text-cream/60'}`}>{rel}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <TextInput
                    value={guest.phone}
                    onChangeText={(v) => updateGuest(i, 'phone', v)}
                    placeholder="Phone (optional, for SMS updates)"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    keyboardType="phone-pad"
                    className="bg-white/10 border border-cream/30 rounded-xl px-4 py-3 text-sm text-cream"
                  />
                </View>
              ))}

              <Pressable
                className="flex-row items-center justify-center gap-2 py-3 border border-dashed border-cream/20 rounded-2xl active:opacity-70 mb-4"
                onPress={addGuest}
              >
                <Ionicons name="add-circle" size={20} color="rgba(255,248,240,0.7)" />
                <Text className="text-sm text-cream/70 font-semibold">Add another guest</Text>
              </Pressable>
            </ScrollView>

            <NavButtons
              onBack={() => goTo(5)}
              onNext={() => goTo(7)}
              showSkip
              onSkip={() => {
                setGuests([{ name: '', relation: 'Grandparent', phone: '' }]);
                goTo(7);
              }}
            />
          </View>

          {/* ===== Step 7: All Set ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 justify-center items-center px-8">
            <View className="w-20 h-20 rounded-full bg-teal/20 items-center justify-center mb-6">
              <Ionicons name="checkmark-circle" size={52} color="#6A9E8A" />
            </View>
            <Text className="text-3xl font-nunito-black text-cream text-center mb-3">
              You're all set!
            </Text>
            <Text className="text-base text-cream text-center mb-2 max-w-xs leading-6">
              {teamName.trim() || 'Your team'} is ready to go.
              {athleteName.trim() ? ` Let's have a great season, ${athleteName.trim()}!` : ''}
            </Text>

            {/* Summary card */}
            <View className="bg-white/10 border border-cream/30 rounded-2xl p-5 w-full max-w-sm mt-4 mb-8">
              <SummaryRow icon="person" text={athleteName.trim() || 'My Athlete'} />
              <SummaryRow icon="people" text={teamName.trim() || '—'} />
              <SummaryRow icon="calendar" text={seasonYear} />
              {teamCode.trim() ? <SummaryRow icon="key" text={teamCode.trim()} /> : null}
              {extractedTournaments.length > 0 && (
                <SummaryRow icon="checkmark-circle" text={`${extractedTournaments.length} tournament${extractedTournaments.length !== 1 ? 's' : ''} ready`} color="#6A9E8A" />
              )}
              {gmailConnected && (
                <SummaryRow icon="checkmark-circle" text={`Gmail: ${gmailEmail || 'connected'}`} color="#6A9E8A" />
              )}
              {trustedEmails.length > 0 && (
                <SummaryRow icon="checkmark-circle" text={`${trustedEmails.length} trusted email${trustedEmails.length !== 1 ? 's' : ''}`} color="#6A9E8A" />
              )}
              {additionalAthletes.filter((a) => a.firstName.trim()).length > 0 && (
                <SummaryRow icon="checkmark-circle" text={`${additionalAthletes.filter((a) => a.firstName.trim()).length} additional player${additionalAthletes.filter((a) => a.firstName.trim()).length !== 1 ? 's' : ''}`} color="#6A9E8A" />
              )}
              {guests.some((g) => g.name.trim()) && (
                <SummaryRow icon="checkmark-circle" text={`${guests.filter((g) => g.name.trim()).length} guest${guests.filter((g) => g.name.trim()).length !== 1 ? 's' : ''} invited`} color="#6A9E8A" />
              )}
            </View>

            <View className="w-full max-w-sm gap-3">
              <Pressable
                className={`bg-cream rounded-2xl py-4 items-center active:opacity-80 ${saving ? 'opacity-60' : ''}`}
                onPress={handleFinish}
                disabled={saving}
              >
                {saving ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator size="small" color="#3B82B0" />
                    <Text className="text-base font-bold text-rally-600">Setting up...</Text>
                  </View>
                ) : (
                  <Text className="text-base font-bold text-rally-600">Open My Dashboard</Text>
                )}
              </Pressable>
              <Pressable
                className="py-3 items-center active:opacity-70"
                onPress={() => goTo(1)}
              >
                <Text className="text-sm text-cream/70">Go back and edit</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ icon, text, color }: { icon: keyof typeof Ionicons.glyphMap; text: string; color?: string }) {
  return (
    <View className="flex-row items-center gap-3 mb-3">
      <Ionicons name={icon} size={18} color={color ?? '#FFF8F0'} />
      <Text className="text-sm text-cream">{text}</Text>
    </View>
  );
}
