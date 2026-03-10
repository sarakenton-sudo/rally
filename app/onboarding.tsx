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
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useGuestStore } from '@/stores/useGuestStore';
import type { TeamConfig, Tournament } from '@/types/database';
import { smartExtract as smartExtractOnboarding } from '@/lib/schedule-parser';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SEASON_OPTIONS = ['2025-2026', '2026-2027'];
const TOTAL_STEPS = 6;

type ScheduleSource = 'leagueapps' | 'paste' | 'later';
type GuestEntry = { name: string; relation: string; phone: string };

export default function OnboardingScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState(0);
  const { user } = useAuth();
  const setTeamConfig = useSeasonStore((s) => s.setTeamConfig);

  // Step 2: Team
  const [clubName, setClubName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [seasonYear, setSeasonYear] = useState(SEASON_OPTIONS[0]);
  const [athleteName, setAthleteName] = useState('');
  const [teamCode, setTeamCode] = useState('');

  // Step 3: Schedule
  const [scheduleSource, setScheduleSource] = useState<ScheduleSource | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedTournaments, setExtractedTournaments] = useState<any[]>([]);
  const [extractError, setExtractError] = useState('');

  // Step 4: Email
  const [emailChoice, setEmailChoice] = useState<'forward' | 'gmail' | 'later' | null>(null);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailStatus, setGmailStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Step 5: Guests
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

  // Inline schedule extraction
  const handleExtractSchedule = async () => {
    const trimmed = pasteText.trim();
    if (!trimmed) {
      setExtractError('Paste your schedule text above first.');
      return;
    }
    setIsExtracting(true);
    setExtractError('');
    setExtractedTournaments([]);

    try {
      let tournaments: any[] = [];

      // Try AI extraction first (5s timeout so it falls back quickly)
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
          if (resp.ok && data.tournaments?.length > 0) {
            tournaments = data.tournaments;
          }
        } catch (e) {
          console.warn('AI extraction failed:', e);
        }
      }

      // Fallback to local parser
      if (tournaments.length === 0) {
        tournaments = smartExtractOnboarding(trimmed);
      }

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

  // Inline Gmail connect
  const handleConnectGmail = useCallback(async () => {
    if (!user || !GOOGLE_CLIENT_ID) {
      setGmailStatus({ text: 'Google not configured yet.', type: 'error' });
      return;
    }
    setGmailConnecting(true);
    setGmailStatus(null);
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

      if (isWeb) {
        window.location.href = authUrl;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, 'rally://auth/gmail-callback');
      if (result.type === 'success' && result.url) {
        const url = new URL(result.url);
        const success = url.searchParams.get('success') === 'true';
        const email = url.searchParams.get('email');
        if (success && email) {
          setGmailStatus({ text: `Connected: ${email}`, type: 'success' });
        } else {
          setGmailStatus({ text: url.searchParams.get('error') ?? 'Connection failed.', type: 'error' });
        }
      }
    } catch (err) {
      setGmailStatus({ text: 'An error occurred connecting Gmail.', type: 'error' });
    } finally {
      setGmailConnecting(false);
    }
  }, [user]);

  const handleFinish = async () => {
    if (!teamName.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Please enter your team name to continue.');
      } else {
        Alert.alert('Team name required', 'Please enter your team name to continue.');
      }
      goTo(1);
      return;
    }

    setSaving(true);

    if (isSupabaseConfigured && user) {
      // 1. Create team config
      // Check if team_config already exists for this user
      const { data: existing } = await supabase
        .from('team_config')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      let data, error;
      if (existing) {
        ({ data, error } = await supabase
          .from('team_config')
          .update({
            team_name: teamName.trim(),
            club_name: clubName.trim() || null,
            season_year: seasonYear,
            athlete_name: athleteName.trim() || null,
            team_code: teamCode.trim() || null,
            schedule_import_source: scheduleSource === 'leagueapps' ? 'leagueapps' : scheduleSource === 'paste' ? 'manual' : null,
          } as any)
          .eq('user_id', user.id)
          .select()
          .single());
      } else {
        ({ data, error } = await supabase
          .from('team_config')
          .insert({
            user_id: user.id,
            team_name: teamName.trim(),
            club_name: clubName.trim() || null,
            season_year: seasonYear,
            athlete_name: athleteName.trim() || null,
            team_code: teamCode.trim() || null,
            schedule_import_source: scheduleSource === 'leagueapps' ? 'leagueapps' : scheduleSource === 'paste' ? 'manual' : null,
          } as any)
          .select()
          .single());
      }

      if (error) {
        setSaving(false);
        console.error('Team config error:', error);
        if (Platform.OS === 'web') {
          window.alert(error.message);
        } else {
          Alert.alert('Error', error.message);
        }
        return;
      }

      setTeamConfig(data as TeamConfig);

      // 2. Save extracted tournaments (if any)
      if (extractedTournaments.length > 0) {
        const { error: tError } = await supabase.from('tournaments').insert(
          extractedTournaments.map((t) => ({
            user_id: user.id,
            name: t.name,
            start_date: t.start_date,
            end_date: t.end_date,
            location_city: t.location_city || null,
            venues: t.venue_name ? [{ label: t.venue_name, address: t.venue_address || '', is_confirmed: false }] : [],
            status: 'upcoming',
            travel_required: true,
          })) as any
        );
        if (tError) {
          console.error('Tournament insert error:', tError);
        }
      }

      // 3. Create guests (if any filled in)
      const validGuests = guests.filter((g) => g.name.trim());
      if (validGuests.length > 0) {
        await supabase.from('guests').insert(
          validGuests.map((g) => ({
            user_id: user.id,
            name: g.name.trim(),
            relationship: g.relation,
            phone: g.phone.trim() || null,
            notify_sms: !!g.phone.trim(),
          })) as any
        );
      }
    } else {
      // Dev mode
      setTeamConfig({
        id: 'onboarding-dev',
        user_id: 'dev',
        team_name: teamName.trim(),
        club_name: clubName.trim() || null,
        season_year: seasonYear,
        athlete_name: athleteName.trim() || null,
        team_code: teamCode.trim() || null,
        club_email_domain: null,
        rally_forward_address: 'plans@rally.app',
        trusted_sender_emails: [],
        vip_sender_emails: [],
        ical_feed_token: '',
        youtube_channel_id: null,
        default_streaming_platform: null,
        default_stream_url: null,
        travel_sync_emails: [],
        gmail_connected: false,
        gmail_email: null,
        schedule_import_source: null,
        schedule_import_connected: false,
        external_links: [],
        notification_preferences: {
          tournament_reminders: true,
          cancellation_deadlines: true,
          email_arrivals: true,
          rsvp_responses: true,
          schedule_changes: true,
        },
        created_at: new Date().toISOString(),
      });
    }

    setSaving(false);
    router.replace('/');
  };

  // Shared navigation buttons
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

  // Onboarding option card
  const OptionCard = ({ icon, title, desc, selected, onPress }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    desc: string;
    selected: boolean;
    onPress: () => void;
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
        <Text className={`text-base font-bold ${selected ? 'text-cream' : 'text-cream/80'}`}>{title}</Text>
        <Text className={`text-sm mt-0.5 ${selected ? 'text-cream/60' : 'text-cream/50'}`}>{desc}</Text>
      </View>
      {selected && (
        <Ionicons name="checkmark-circle" size={22} color="#6A9E8A" />
      )}
    </Pressable>
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
              className={`rounded-full transition-all ${
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
                { icon: 'people' as const, text: 'Set up your athlete' },
                { icon: 'calendar' as const, text: 'Add your schedule' },
                { icon: 'mail' as const, text: 'Connect your email' },
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

          {/* ===== Step 1: Team Setup ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="flex-row items-center gap-3 mb-5">
                <View className="w-10 h-10 rounded-xl bg-cream/10 items-center justify-center">
                  <Ionicons name="people" size={22} color="#FFF8F0" />
                </View>
                <View>
                  <Text className="text-2xl font-nunito-black text-cream">Your Team</Text>
                  <Text className="text-sm text-cream/70">Tell us about your player's team</Text>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold text-cream mb-1.5">Club Name *</Text>
                <TextInput
                  value={clubName}
                  onChangeText={setClubName}
                  placeholder="e.g. Austin Juniors Volleyball"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  className="bg-white/10 border border-cream/20 rounded-xl px-4 py-3 text-base text-cream"
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold text-cream mb-1.5">Team Name *</Text>
                <TextInput
                  value={teamName}
                  onChangeText={setTeamName}
                  placeholder="e.g. AJV Travel 14u"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  className="bg-white/10 border border-cream/20 rounded-xl px-4 py-3 text-base text-cream"
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold text-cream mb-1.5">Season</Text>
                <View className="flex-row gap-2">
                  {SEASON_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt}
                      className={`flex-1 py-3 rounded-xl items-center border ${
                        seasonYear === opt
                          ? 'bg-cream border-cream'
                          : 'bg-white/5 border-cream/20'
                      }`}
                      onPress={() => setSeasonYear(opt)}
                    >
                      <Text className={`text-sm font-bold ${seasonYear === opt ? 'text-rally-600' : 'text-cream'}`}>
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold text-cream mb-1.5">Athlete's First Name</Text>
                <TextInput
                  value={athleteName}
                  onChangeText={setAthleteName}
                  placeholder="e.g. Sophie"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  className="bg-white/10 border border-cream/20 rounded-xl px-4 py-3 text-base text-cream"
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold text-cream mb-1.5">
                  Team Ticket Code <Text className="text-cream/60 font-normal">(optional)</Text>
                </Text>
                <TextInput
                  value={teamCode}
                  onChangeText={setTeamCode}
                  placeholder="e.g. AJV14U"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  autoCapitalize="characters"
                  className="bg-white/10 border border-cream/20 rounded-xl px-4 py-3 text-base text-cream"
                  style={{ letterSpacing: 2 }}
                />
              </View>
            </ScrollView>

            <NavButtons
              onBack={() => goTo(0)}
              onNext={() => {
                if (!teamName.trim()) {
                  Alert.alert('Team name required', 'Please enter your team name.');
                  return;
                }
                goTo(2);
              }}
              nextDisabled={!teamName.trim()}
            />
          </View>

          {/* ===== Step 2: Schedule ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="flex-row items-center gap-3 mb-2">
                <View className="w-10 h-10 rounded-xl bg-cream/10 items-center justify-center">
                  <Ionicons name="calendar" size={22} color="#FFF8F0" />
                </View>
                <View>
                  <Text className="text-2xl font-nunito-black text-cream">Tournament Schedule</Text>
                  <Text className="text-sm text-cream/70">How do you want to add tournaments?</Text>
                </View>
              </View>

              <Text className="text-sm text-cream/60 mb-4 mt-1">
                You can always add more later in Settings.
              </Text>

              <OptionCard
                icon="clipboard"
                title="Paste schedule"
                desc="Paste a coach message, email, or list"
                selected={scheduleSource === 'paste'}
                onPress={() => setScheduleSource('paste')}
              />

              {/* Inline paste area */}
              {scheduleSource === 'paste' && (
                <View className="mb-3">
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
                    className={`rounded-xl py-3 items-center ${
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
                    <View className="bg-red-500/20 rounded-xl p-3 mt-3">
                      <Text className="text-xs text-red-300 text-center font-semibold">{extractError}</Text>
                    </View>
                  ) : null}

                  {/* Show extracted tournaments */}
                  {extractedTournaments.length > 0 && (
                    <View className="mt-4 bg-teal/10 border-2 border-teal/40 rounded-2xl p-4">
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
                            {t.venue_name ? (
                              <Text className="text-xs text-cream/45 mt-0.5">{t.venue_name}</Text>
                            ) : null}
                          </View>
                          <Ionicons name="checkmark" size={16} color="#6A9E8A" />
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <OptionCard
                icon="globe"
                title="Import from LeagueApps"
                desc="Auto-sync your schedule from LeagueApps"
                selected={scheduleSource === 'leagueapps'}
                onPress={() => setScheduleSource('leagueapps')}
              />

              <OptionCard
                icon="time"
                title="I'll add them later"
                desc="Skip for now and add tournaments manually"
                selected={scheduleSource === 'later'}
                onPress={() => setScheduleSource('later')}
              />
            </ScrollView>

            <NavButtons
              onBack={() => goTo(1)}
              onNext={() => goTo(3)}
            />
          </View>

          {/* ===== Step 3: Email ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="flex-row items-center gap-3 mb-2">
                <View className="w-10 h-10 rounded-xl bg-cream/10 items-center justify-center">
                  <Ionicons name="mail" size={22} color="#FFF8F0" />
                </View>
                <View>
                  <Text className="text-2xl font-nunito-black text-cream">Email Integration</Text>
                  <Text className="text-sm text-cream/70">Auto-capture hotel & flight confirmations</Text>
                </View>
              </View>

              <Text className="text-sm text-cream/60 mb-4 mt-1">
                RALLY can detect booking confirmations in your email automatically.
              </Text>

              <OptionCard
                icon="logo-google"
                title="Connect Gmail"
                desc="Auto-detect booking emails (read-only)"
                selected={emailChoice === 'gmail'}
                onPress={() => setEmailChoice('gmail')}
              />

              {/* Inline Gmail connect */}
              {emailChoice === 'gmail' && (
                <View className="mb-3">
                  {gmailStatus && (
                    <View className={`rounded-xl p-3 mb-3 ${gmailStatus.type === 'success' ? 'bg-teal/20' : 'bg-red-500/20'}`}>
                      <Text className={`text-xs font-semibold text-center ${gmailStatus.type === 'success' ? 'text-teal' : 'text-red-300'}`}>
                        {gmailStatus.text}
                      </Text>
                    </View>
                  )}
                  {!gmailStatus?.type || gmailStatus.type !== 'success' ? (
                    <Pressable
                      className={`rounded-xl py-3 items-center ${gmailConnecting ? 'bg-cream/10' : 'bg-cream active:opacity-80'}`}
                      onPress={handleConnectGmail}
                      disabled={gmailConnecting}
                    >
                      <View className="flex-row items-center gap-2">
                        {gmailConnecting ? (
                          <ActivityIndicator size="small" color="#3B82B0" />
                        ) : (
                          <Ionicons name="logo-google" size={16} color="#3B82B0" />
                        )}
                        <Text className="text-sm font-bold text-rally-600">
                          {gmailConnecting ? 'Connecting...' : 'Connect Gmail Now'}
                        </Text>
                      </View>
                    </Pressable>
                  ) : null}
                  <Text className="text-xs text-cream/50 mt-2 text-center">
                    Read-only access — RALLY never sends emails
                  </Text>
                </View>
              )}

              <OptionCard
                icon="paper-plane"
                title="Forward emails to RALLY"
                desc="Manually forward confirmations"
                selected={emailChoice === 'forward'}
                onPress={() => setEmailChoice('forward')}
              />

              {/* Inline forward address */}
              {emailChoice === 'forward' && (
                <View className="bg-cream/15 rounded-2xl p-4 mb-3">
                  <Text className="text-xs text-cream/60 uppercase tracking-wider font-bold mb-1">Your RALLY address</Text>
                  <Text className="text-lg text-cream font-bold" selectable>plans@rally.app</Text>
                  <Text className="text-xs text-cream/50 mt-2">
                    Forward hotel & flight confirmation emails here. We'll extract dates, costs, and confirmation numbers automatically.
                  </Text>
                </View>
              )}

              <OptionCard
                icon="time"
                title="I'll set this up later"
                desc="You can always connect in Settings"
                selected={emailChoice === 'later'}
                onPress={() => setEmailChoice('later')}
              />
            </ScrollView>

            <NavButtons
              onBack={() => goTo(2)}
              onNext={() => goTo(4)}
            />
          </View>

          {/* ===== Step 4: Guests ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <View className="flex-row items-center gap-3 mb-2">
              <View className="w-10 h-10 rounded-xl bg-cream/10 items-center justify-center">
                <Ionicons name="heart" size={22} color="#FFF8F0" />
              </View>
              <View>
                <Text className="text-2xl font-nunito-black text-cream">Invite Family</Text>
                <Text className="text-sm text-cream/70">Who else follows along?</Text>
              </View>
            </View>

            <Text className="text-sm text-cream/60 mb-4 mt-1">
              Add grandparents, co-parents, or anyone who needs the schedule. They'll get a read-only view — no app required.
            </Text>

            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {guests.map((guest, i) => (
                <View key={i} className="bg-white/10 border border-cream/30 rounded-2xl p-4 mb-3">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-sm text-cream/70 uppercase tracking-wider font-bold">
                      Guest {i + 1}
                    </Text>
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

                  <View className="flex-row gap-2 mb-2">
                    {['Grandparent', 'Co-Parent', 'Family', 'Other'].map((rel) => (
                      <Pressable
                        key={rel}
                        className={`py-2 px-3 rounded-lg border ${
                          guest.relation === rel ? 'bg-cream/20 border-cream/50' : 'border-cream/25'
                        }`}
                        onPress={() => updateGuest(i, 'relation', rel)}
                      >
                        <Text className={`text-xs font-semibold ${guest.relation === rel ? 'text-cream' : 'text-cream/60'}`}>
                          {rel}
                        </Text>
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
              onBack={() => goTo(3)}
              onNext={() => goTo(5)}
              showSkip
              onSkip={() => {
                setGuests([{ name: '', relation: 'Grandparent', phone: '' }]);
                goTo(5);
              }}
            />
          </View>

          {/* ===== Step 5: All Set ===== */}
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
              <View className="flex-row items-center gap-3 mb-3">
                <Ionicons name="people" size={18} color="#FFF8F0" />
                <Text className="text-sm text-cream font-bold">{teamName.trim() || '—'}</Text>
              </View>
              <View className="flex-row items-center gap-3 mb-3">
                <Ionicons name="calendar" size={18} color="#FFF8F0" />
                <Text className="text-sm text-cream">{seasonYear}</Text>
              </View>
              {teamCode.trim() ? (
                <View className="flex-row items-center gap-3 mb-3">
                  <Ionicons name="key" size={18} color="#FFF8F0" />
                  <Text className="text-sm text-cream tracking-widest">{teamCode.trim()}</Text>
                </View>
              ) : null}
              {extractedTournaments.length > 0 ? (
                <View className="flex-row items-center gap-3 mb-3">
                  <Ionicons name="checkmark-circle" size={18} color="#6A9E8A" />
                  <Text className="text-sm text-cream">
                    {extractedTournaments.length} tournament{extractedTournaments.length !== 1 ? 's' : ''} ready to import
                  </Text>
                </View>
              ) : scheduleSource && scheduleSource !== 'later' ? (
                <View className="flex-row items-center gap-3 mb-3">
                  <Ionicons name="checkmark-circle" size={18} color="#6A9E8A" />
                  <Text className="text-sm text-cream">
                    {scheduleSource === 'leagueapps' ? 'LeagueApps import' : 'Schedule paste'}
                  </Text>
                </View>
              ) : null}
              {emailChoice && emailChoice !== 'later' ? (
                <View className="flex-row items-center gap-3 mb-3">
                  <Ionicons name="checkmark-circle" size={18} color="#6A9E8A" />
                  <Text className="text-sm text-cream">
                    {emailChoice === 'forward' ? 'Email forwarding' : 'Gmail connected'}
                  </Text>
                </View>
              ) : null}
              {guests.some((g) => g.name.trim()) ? (
                <View className="flex-row items-center gap-3">
                  <Ionicons name="checkmark-circle" size={18} color="#6A9E8A" />
                  <Text className="text-sm text-cream">
                    {guests.filter((g) => g.name.trim()).length} guest{guests.filter((g) => g.name.trim()).length !== 1 ? 's' : ''} invited
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="w-full max-w-sm gap-3">
              <Pressable
                className={`bg-cream rounded-2xl py-4 items-center active:opacity-80 ${saving ? 'opacity-60' : ''}`}
                onPress={handleFinish}
                disabled={saving}
              >
                <Text className="text-base font-bold text-rally-600">
                  {saving ? 'Setting up...' : 'Open My Dashboard'}
                </Text>
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
