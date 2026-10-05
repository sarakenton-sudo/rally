import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { fetchCoachPolicies, acceptCoachPolicies, acceptPoliciesAsAthlete, fetchCoachById, type CoachPolicies } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';

/**
 * Sign a coach's lesson terms + release for one athlete (from the coach's
 * "Request signature"): /coaching/sign?coachId=…&athleteId=…
 * Parents sign as guardian; an athlete with their own login co-signs.
 */
export default function SignReleaseScreen() {
  const ic = useIconColors();
  const { coachId, athleteId } = useLocalSearchParams<{ coachId: string; athleteId?: string }>();
  const { userProfile } = useAuth();
  const athletes = useSeasonStore((s) => s.athletes);
  const isAthlete = userProfile?.role === 'athlete';
  const athlete = athletes.find((a) => a.id === athleteId);

  const [policies, setPolicies] = useState<CoachPolicies | null>(null);
  const [coachName, setCoachName] = useState('your coach');
  const [loading, setLoading] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeRelease, setAgreeRelease] = useState(false);
  const [signer, setSigner] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!coachId) return;
    Promise.all([fetchCoachPolicies(coachId), fetchCoachById(coachId)]).then(([p, c]) => {
      setPolicies(p.data);
      if (c.data?.display_name) setCoachName(c.data.display_name);
      setLoading(false);
    });
  }, [coachId]);

  const sign = async () => {
    setError(null);
    if (!agreeTerms || !agreeRelease) { setError('Accept the lesson terms and the release to continue.'); return; }
    if (signer.trim().length < 2) { setError('Type your full name to sign.'); return; }
    if (!isAthlete && !athleteId) { setError('This link is missing the athlete. Ask your coach to send it again.'); return; }
    setBusy(true);
    const { error: e } = isAthlete
      ? await acceptPoliciesAsAthlete(coachId!, signer.trim())
      : await acceptCoachPolicies(coachId!, athleteId!, signer.trim());
    setBusy(false);
    if (e) { setError(`Couldn't sign: ${e.message}`); notifyError(); return; }
    notifySuccess();
    setDone(true);
  };

  const who = isAthlete ? 'yourself' : athlete?.first_name ?? 'your athlete';

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} className="p-1" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">Sign terms & release</Text>
          <View className="w-6" />
        </View>

        {loading ? <ActivityIndicator color="#3B82B0" className="mt-8" /> : !policies ? (
          <Text className="text-sm text-stone text-center mt-8 px-6">This coach's terms couldn't be loaded. Ask them to send the link again.</Text>
        ) : done ? (
          <View className="items-center px-6 pt-12">
            <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
            <Text className="text-lg font-bold text-bark dark:text-cream mt-3 text-center">Signed for {who}</Text>
            <Text className="text-sm text-stone dark:text-parchment mt-1 text-center">It's on file with {coachName}. You can see it any time on the athlete's page under Signed Documents.</Text>
            <Pressable onPress={() => router.replace('/(tabs)')} className="rounded-xl px-5 py-3 mt-6 bg-rally-600 active:opacity-80">
              <Text className="text-sm font-bold text-white">Done</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <Text className="text-sm text-bark dark:text-cream mb-3 leading-5">
              {isAthlete
                ? `${coachName} asked you to co-sign their lesson terms and release.`
                : `${coachName} needs these signed for ${who} before lessons. You sign once; it stays on file.`}
            </Text>
            {[
              { title: 'Lesson Terms', text: policies.terms, on: agreeTerms, set: setAgreeTerms, label: 'I agree to the lesson terms' },
              { title: 'Participant Release', text: policies.release, on: agreeRelease, set: setAgreeRelease, label: 'I agree to the release' },
            ].map((d) => (
              <View key={d.title} className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-3">
                <Text className="text-sm font-bold text-bark dark:text-cream mb-2">{d.title}</Text>
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  <Text className="text-xs text-bark dark:text-cream leading-5">{d.text}</Text>
                </ScrollView>
                <Pressable onPress={() => d.set(!d.on)} className="flex-row items-center mt-3" accessibilityRole="checkbox" accessibilityState={{ checked: d.on }} aria-checked={d.on}>
                  <Ionicons name={d.on ? 'checkbox' : 'square-outline'} size={20} color="#3B82B0" />
                  <Text className="text-sm text-bark dark:text-cream ml-2">{d.label}</Text>
                </Pressable>
              </View>
            ))}
            <Text className="text-xs text-stone dark:text-parchment mb-1 ml-1">Type your full name to sign</Text>
            <TextInput
              value={signer}
              onChangeText={setSigner}
              placeholder="Full name"
              placeholderTextColor="#8FA8BF"
              autoCapitalize="words"
              className="bg-warm-white dark:bg-bark-light rounded-xl px-3.5 py-3 text-base text-bark dark:text-cream border border-parchment dark:border-rally-900"
              accessibilityLabel="Full name"
            />
            {error ? <Text className="text-sm text-red-700 mt-3">{error}</Text> : null}
            <Pressable onPress={sign} disabled={busy} className={`rounded-xl py-3.5 items-center mt-5 ${busy ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}>
              <Text className="text-base font-bold text-white">{busy ? 'Signing…' : 'Sign'}</Text>
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
