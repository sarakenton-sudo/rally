import { useState, useRef } from 'react';
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
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useGuestStore } from '@/stores/useGuestStore';
import type { TeamConfig } from '@/types/database';

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
  const [teamName, setTeamName] = useState('');
  const [seasonYear, setSeasonYear] = useState(SEASON_OPTIONS[0]);
  const [athleteName, setAthleteName] = useState('');
  const [teamCode, setTeamCode] = useState('');

  // Step 3: Schedule
  const [scheduleSource, setScheduleSource] = useState<ScheduleSource | null>(null);

  // Step 4: Email
  const [emailChoice, setEmailChoice] = useState<'forward' | 'gmail' | 'later' | null>(null);

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

  const handleFinish = async () => {
    if (!teamName.trim()) {
      Alert.alert('Team name required', 'Please enter your team name to continue.');
      goTo(1);
      return;
    }

    setSaving(true);

    if (isSupabaseConfigured && user) {
      // 1. Create team config
      const { data, error } = await supabase
        .from('team_config')
        .insert({
          user_id: user.id,
          team_name: teamName.trim(),
          season_year: seasonYear,
          athlete_name: athleteName.trim() || null,
          team_code: teamCode.trim() || null,
          schedule_import_source: scheduleSource === 'leagueapps' ? 'leagueapps' : scheduleSource === 'paste' ? 'manual' : null,
        } as any)
        .select()
        .single();

      if (error) {
        setSaving(false);
        Alert.alert('Error', error.message);
        return;
      }

      setTeamConfig(data as TeamConfig);

      // 2. Create guests (if any filled in)
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

    // Route to schedule import if they chose that
    if (scheduleSource === 'paste') {
      router.replace('/import/paste');
    } else if (scheduleSource === 'leagueapps') {
      router.replace('/settings/leagueapps-connect');
    } else if (emailChoice === 'gmail') {
      router.replace('/settings/email-connect');
    } else {
      router.replace('/');
    }
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
          <Text className="text-sm text-cream/40">Skip for now</Text>
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
        selected ? 'bg-cream/15 border-cream/50' : 'bg-white/5 border-cream/15'
      }`}
      onPress={onPress}
    >
      <View className={`w-11 h-11 rounded-xl items-center justify-center ${selected ? 'bg-cream/20' : 'bg-white/5'}`}>
        <Ionicons name={icon} size={22} color={selected ? '#FFF8F0' : 'rgba(255,248,240,0.4)'} />
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-bold ${selected ? 'text-cream' : 'text-cream/60'}`}>{title}</Text>
        <Text className="text-xs text-cream/35 mt-0.5">{desc}</Text>
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
            <View className="w-24 h-24 rounded-3xl bg-cream/10 items-center justify-center mb-8">
              <Ionicons name="trophy" size={52} color="#FFF8F0" />
            </View>
            <Text className="text-4xl font-nunito-black text-cream text-center mb-4">
              Welcome to{'\n'}RallyHUB
            </Text>
            <Text className="text-base text-cream/60 text-center mb-2 max-w-xs leading-6">
              Your family's command center for travel volleyball. Let's get you set up — it only takes a minute.
            </Text>

            <View className="mt-6 mb-10 gap-3">
              {[
                { icon: 'people' as const, text: 'Set up your team' },
                { icon: 'calendar' as const, text: 'Add your schedule' },
                { icon: 'mail' as const, text: 'Connect your email' },
                { icon: 'heart' as const, text: 'Invite family' },
              ].map((item) => (
                <View key={item.text} className="flex-row items-center gap-3">
                  <Ionicons name={item.icon} size={16} color="#6A9E8A" />
                  <Text className="text-sm text-cream/50">{item.text}</Text>
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
                  <Text className="text-lg font-nunito-black text-cream">Your Team</Text>
                  <Text className="text-xs text-cream/40">Tell us about your player's team</Text>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold text-cream/80 mb-1.5">Team Name *</Text>
                <TextInput
                  value={teamName}
                  onChangeText={setTeamName}
                  placeholder="e.g. AJV Travel 14u"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  className="bg-white/10 border border-cream/20 rounded-xl px-4 py-3 text-base text-cream"
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold text-cream/80 mb-1.5">Season</Text>
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
                      <Text className={`text-sm font-bold ${seasonYear === opt ? 'text-rally-600' : 'text-cream/60'}`}>
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold text-cream/80 mb-1.5">Athlete's First Name</Text>
                <TextInput
                  value={athleteName}
                  onChangeText={setAthleteName}
                  placeholder="e.g. Sophie"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  className="bg-white/10 border border-cream/20 rounded-xl px-4 py-3 text-base text-cream"
                />
              </View>

              <View className="mb-4">
                <Text className="text-sm font-semibold text-cream/80 mb-1.5">
                  Team Ticket Code <Text className="text-cream/30 font-normal">(optional)</Text>
                </Text>
                <TextInput
                  value={teamCode}
                  onChangeText={setTeamCode}
                  placeholder="e.g. AJV14U"
                  placeholderTextColor="rgba(255,255,255,0.25)"
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
            <View className="flex-row items-center gap-3 mb-2">
              <View className="w-10 h-10 rounded-xl bg-cream/10 items-center justify-center">
                <Ionicons name="calendar" size={22} color="#FFF8F0" />
              </View>
              <View>
                <Text className="text-lg font-nunito-black text-cream">Tournament Schedule</Text>
                <Text className="text-xs text-cream/40">How do you want to add tournaments?</Text>
              </View>
            </View>

            <Text className="text-sm text-cream/40 mb-5 mt-1">
              You can always change this later in Settings.
            </Text>

            <OptionCard
              icon="globe"
              title="Import from LeagueApps"
              desc="Auto-sync your schedule from LeagueApps"
              selected={scheduleSource === 'leagueapps'}
              onPress={() => setScheduleSource('leagueapps')}
            />

            <OptionCard
              icon="clipboard"
              title="Paste or type schedule"
              desc="Copy from an email or website and we'll parse it"
              selected={scheduleSource === 'paste'}
              onPress={() => setScheduleSource('paste')}
            />

            <OptionCard
              icon="time"
              title="I'll add them later"
              desc="Skip for now and add tournaments manually"
              selected={scheduleSource === 'later'}
              onPress={() => setScheduleSource('later')}
            />

            <NavButtons
              onBack={() => goTo(1)}
              onNext={() => goTo(3)}
            />
          </View>

          {/* ===== Step 3: Email ===== */}
          <View style={{ width: SCREEN_WIDTH }} className="flex-1 px-6 pt-4">
            <View className="flex-row items-center gap-3 mb-2">
              <View className="w-10 h-10 rounded-xl bg-cream/10 items-center justify-center">
                <Ionicons name="mail" size={22} color="#FFF8F0" />
              </View>
              <View>
                <Text className="text-lg font-nunito-black text-cream">Email Integration</Text>
                <Text className="text-xs text-cream/40">Let RALLY auto-capture hotel & flight confirmations</Text>
              </View>
            </View>

            <Text className="text-sm text-cream/40 mb-5 mt-1">
              Forward booking confirmations and RALLY's AI will extract the details automatically.
            </Text>

            <OptionCard
              icon="paper-plane"
              title="Forward emails to RALLY"
              desc="Forward confirmations to plans@rally.app"
              selected={emailChoice === 'forward'}
              onPress={() => setEmailChoice('forward')}
            />

            <OptionCard
              icon="logo-google"
              title="Connect Gmail"
              desc="Auto-detect booking emails (requires OAuth)"
              selected={emailChoice === 'gmail'}
              onPress={() => setEmailChoice('gmail')}
            />

            <OptionCard
              icon="time"
              title="I'll set this up later"
              desc="You can always connect in Settings"
              selected={emailChoice === 'later'}
              onPress={() => setEmailChoice('later')}
            />

            {emailChoice === 'forward' && (
              <View className="bg-cream/10 rounded-2xl p-4 mt-2">
                <Text className="text-xs text-cream/40 uppercase tracking-wider font-bold mb-1">Your RALLY address</Text>
                <Text className="text-lg text-cream font-bold" selectable>plans@rally.app</Text>
                <Text className="text-xs text-cream/30 mt-2">Forward hotel & flight confirmation emails here and we'll handle the rest.</Text>
              </View>
            )}

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
                <Text className="text-lg font-nunito-black text-cream">Invite Family</Text>
                <Text className="text-xs text-cream/40">Who else follows along?</Text>
              </View>
            </View>

            <Text className="text-sm text-cream/40 mb-4 mt-1">
              Add grandparents, co-parents, or anyone who needs the schedule. They'll get a read-only view — no app required.
            </Text>

            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {guests.map((guest, i) => (
                <View key={i} className="bg-cream/8 border border-cream/15 rounded-2xl p-4 mb-3">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-xs text-cream/40 uppercase tracking-wider font-bold">
                      Guest {i + 1}
                    </Text>
                    {guests.length > 1 && (
                      <Pressable onPress={() => removeGuest(i)} className="active:opacity-70">
                        <Ionicons name="close-circle" size={20} color="rgba(255,248,240,0.3)" />
                      </Pressable>
                    )}
                  </View>

                  <TextInput
                    value={guest.name}
                    onChangeText={(v) => updateGuest(i, 'name', v)}
                    placeholder="Name (e.g. Grandma Sue)"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    className="bg-white/10 border border-cream/15 rounded-xl px-4 py-3 text-sm text-cream mb-2"
                  />

                  <View className="flex-row gap-2 mb-2">
                    {['Grandparent', 'Co-Parent', 'Family', 'Other'].map((rel) => (
                      <Pressable
                        key={rel}
                        className={`py-2 px-3 rounded-lg border ${
                          guest.relation === rel ? 'bg-cream/15 border-cream/40' : 'border-cream/10'
                        }`}
                        onPress={() => updateGuest(i, 'relation', rel)}
                      >
                        <Text className={`text-xs font-semibold ${guest.relation === rel ? 'text-cream' : 'text-cream/30'}`}>
                          {rel}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <TextInput
                    value={guest.phone}
                    onChangeText={(v) => updateGuest(i, 'phone', v)}
                    placeholder="Phone (optional, for SMS updates)"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    keyboardType="phone-pad"
                    className="bg-white/10 border border-cream/15 rounded-xl px-4 py-3 text-sm text-cream"
                  />
                </View>
              ))}

              <Pressable
                className="flex-row items-center justify-center gap-2 py-3 border border-dashed border-cream/20 rounded-2xl active:opacity-70 mb-4"
                onPress={addGuest}
              >
                <Ionicons name="add-circle" size={20} color="rgba(255,248,240,0.4)" />
                <Text className="text-sm text-cream/40 font-semibold">Add another guest</Text>
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
            <Text className="text-base text-cream/50 text-center mb-2 max-w-xs leading-6">
              {teamName.trim() || 'Your team'} is ready to go.
              {athleteName.trim() ? ` Let's have a great season, ${athleteName.trim()}!` : ''}
            </Text>

            {/* Summary card */}
            <View className="bg-cream/10 rounded-2xl p-5 w-full max-w-sm mt-4 mb-8">
              <View className="flex-row items-center gap-3 mb-3">
                <Ionicons name="people" size={18} color="#FFF8F0" />
                <Text className="text-sm text-cream font-bold">{teamName.trim() || '—'}</Text>
              </View>
              <View className="flex-row items-center gap-3 mb-3">
                <Ionicons name="calendar" size={18} color="#FFF8F0" />
                <Text className="text-sm text-cream/70">{seasonYear}</Text>
              </View>
              {teamCode.trim() ? (
                <View className="flex-row items-center gap-3 mb-3">
                  <Ionicons name="key" size={18} color="#FFF8F0" />
                  <Text className="text-sm text-cream/70 tracking-widest">{teamCode.trim()}</Text>
                </View>
              ) : null}
              {scheduleSource && scheduleSource !== 'later' ? (
                <View className="flex-row items-center gap-3 mb-3">
                  <Ionicons name="checkmark-circle" size={18} color="#6A9E8A" />
                  <Text className="text-sm text-cream/70">
                    {scheduleSource === 'leagueapps' ? 'LeagueApps import' : 'Manual schedule'}
                  </Text>
                </View>
              ) : null}
              {emailChoice && emailChoice !== 'later' ? (
                <View className="flex-row items-center gap-3 mb-3">
                  <Ionicons name="checkmark-circle" size={18} color="#6A9E8A" />
                  <Text className="text-sm text-cream/70">
                    {emailChoice === 'forward' ? 'Email forwarding' : 'Gmail connected'}
                  </Text>
                </View>
              ) : null}
              {guests.some((g) => g.name.trim()) ? (
                <View className="flex-row items-center gap-3">
                  <Ionicons name="checkmark-circle" size={18} color="#6A9E8A" />
                  <Text className="text-sm text-cream/70">
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
                <Text className="text-sm text-cream/40">Go back and edit</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
