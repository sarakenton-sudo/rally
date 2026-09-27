import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCoachStore } from '@/stores/useCoachStore';
import {
  fetchCoachPolicies, saveMyCoachPolicies, fetchCoachPlatformAgreement, acceptCoachPlatformAgreement,
  isSupabaseConfigured, type CoachPolicies,
} from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError, tapLight } from '@/lib/haptics';

type DocKey = 'terms' | 'release';
const DOCS: { key: DocKey; title: string; blurb: string }[] = [
  { key: 'terms', title: 'Lesson Terms', blurb: 'Booking, payment, cancellations, late arrivals, conduct, photos.' },
  { key: 'release', title: 'Liability Release', blurb: 'Assumption of risk, release of claims, medical authorization, parent/guardian consent.' },
];

export default function CoachPoliciesScreen() {
  const ic = useIconColors();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const [pol, setPol] = useState<CoachPolicies | null>(null);
  const [agreement, setAgreement] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DocKey | null>(null);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const alertMsg = (t: string, m: string) => (Platform.OS === 'web' ? window.alert(`${t}: ${m}`) : Alert.alert(t, m));

  const load = useCallback(async () => {
    if (!coachProfile || !isSupabaseConfigured) { setLoading(false); return; }
    const [p, a] = await Promise.all([fetchCoachPolicies(coachProfile.id), fetchCoachPlatformAgreement()]);
    setPol(p.data);
    setAgreement(a);
    setLoading(false);
  }, [coachProfile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Custom text for a doc, or null to keep the RallyHUB default.
  const current = (k: DocKey): string | null => {
    if (!pol) return null;
    const isDefault = k === 'terms' ? pol.terms_is_default : pol.release_is_default;
    return isDefault ? null : (k === 'terms' ? pol.terms : pol.release);
  };

  const save = async (terms: string | null, release: string | null, msg: string) => {
    setBusy(true);
    const { data, error } = await saveMyCoachPolicies(terms, release);
    setBusy(false);
    if (error) { notifyError(); alertMsg("Couldn't save", error.message); return; }
    setPol(data);
    setEditing(null);
    notifySuccess();
    alertMsg('Saved', msg);
  };

  const acceptAgreement = async () => {
    setBusy(true);
    const { error } = await acceptCoachPlatformAgreement();
    setBusy(false);
    if (error) { notifyError(); alertMsg("Couldn't save", error.message); return; }
    notifySuccess();
    load();
  };

  const Doc = ({ id, title, text, badge }: { id: string; title: string; text: string; badge?: string }) => (
    <View>
      <Pressable onPress={() => { tapLight(); setOpen(open === id ? null : id); }} className="flex-row items-center py-1">
        <Ionicons name={open === id ? 'chevron-down' : 'chevron-forward'} size={14} color="#3B82B0" />
        <Text className="text-xs font-semibold text-rally-600 ml-1">{open === id ? 'Hide' : 'Read'} {title}</Text>
        {badge ? <Text className="text-[10px] font-bold text-stone ml-2">{badge}</Text> : null}
      </Pressable>
      {open === id && (
        <View className="bg-cream dark:bg-bark rounded-lg p-3 mt-1 border border-parchment dark:border-rally-900">
          <Text className="text-xs leading-5 text-bark dark:text-cream">{text}</Text>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Terms & Release</Text>
        <View className="w-6" />
      </View>

      {loading || !pol ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View className="flex-row items-start rounded-xl p-3 mb-4" style={{ backgroundColor: '#d977061a' }}>
            <Ionicons name="information-circle" size={18} color="#b45309" />
            <Text className="text-xs text-bark dark:text-cream ml-2 flex-1 leading-5">
              RallyHUB's templates are a starting point, not legal advice. Waiver rules vary by state, especially for minors — have an attorney review your terms and release. Families accept them before every first lesson, and again whenever you change them.
            </Text>
          </View>

          {/* Platform agreement */}
          <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
            <View className="flex-row items-center mb-1">
              <Ionicons name="shield-checkmark" size={18} color={pol.platform_agreement_accepted_at ? '#16a34a' : '#3B82B0'} />
              <Text className="text-base font-bold text-bark dark:text-cream ml-2">Coach Platform Agreement</Text>
            </View>
            <Text className="text-xs text-stone dark:text-parchment mb-2">
              {pol.platform_agreement_accepted_at
                ? `Accepted ${new Date(pol.platform_agreement_accepted_at).toLocaleDateString()}.`
                : 'Required before families can book with you: you run an independent business and carry your own insurance and certifications.'}
            </Text>
            <Doc id="agreement" title="agreement" text={agreement} />
            {!pol.platform_agreement_accepted_at && (
              <Pressable disabled={busy} onPress={acceptAgreement} className="bg-rally-600 rounded-xl py-3 items-center mt-3 active:opacity-80">
                <Text className="text-sm font-bold text-cream">{busy ? 'Saving…' : 'I agree'}</Text>
              </Pressable>
            )}
          </View>

          {/* Coach documents */}
          {DOCS.map((d) => {
            const isDefault = d.key === 'terms' ? pol.terms_is_default : pol.release_is_default;
            const text = d.key === 'terms' ? pol.terms : pol.release;
            return (
              <View key={d.key} className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-base font-bold text-bark dark:text-cream">{d.title}</Text>
                  <View className="rounded-md px-2 py-0.5" style={{ backgroundColor: isDefault ? '#3B82B01a' : '#7c3aed1a' }}>
                    <Text className="text-[10px] font-bold" style={{ color: isDefault ? '#3B82B0' : '#7c3aed' }}>
                      {isDefault ? 'RALLYHUB DEFAULT' : 'YOUR VERSION'}
                    </Text>
                  </View>
                </View>
                <Text className="text-xs text-stone dark:text-parchment mb-2">{d.blurb}</Text>

                {editing === d.key ? (
                  <>
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      multiline
                      textAlignVertical="top"
                      className="bg-cream dark:bg-bark rounded-lg p-3 text-xs leading-5 text-bark dark:text-cream border border-parchment dark:border-rally-900"
                      style={{ minHeight: 260 }}
                    />
                    <View className="flex-row mt-2">
                      <Pressable
                        disabled={busy}
                        onPress={() => save(
                          d.key === 'terms' ? draft : current('terms'),
                          d.key === 'release' ? draft : current('release'),
                          'Families will accept the new version before their next booking.',
                        )}
                        className="bg-rally-600 rounded-lg px-4 py-2 mr-2 active:opacity-80"
                      >
                        <Text className="text-xs font-bold text-cream">{busy ? 'Saving…' : 'Save my version'}</Text>
                      </Pressable>
                      <Pressable onPress={() => setEditing(null)} className="px-3 py-2">
                        <Text className="text-xs font-semibold text-stone">Cancel</Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Doc id={d.key} title={d.title} text={text} />
                    <View className="flex-row mt-2">
                      <Pressable onPress={() => { setDraft(text); setEditing(d.key); }} className="rounded-lg px-3 py-1.5 mr-2 bg-rally-50 dark:bg-rally-900/30 active:opacity-70">
                        <Text className="text-xs font-semibold text-rally-600">{isDefault ? 'Customize' : 'Edit'}</Text>
                      </Pressable>
                      {!isDefault && (
                        <Pressable
                          disabled={busy}
                          onPress={() => save(
                            d.key === 'terms' ? null : current('terms'),
                            d.key === 'release' ? null : current('release'),
                            `${d.title} reset to the RallyHUB default.`,
                          )}
                          className="rounded-lg px-3 py-1.5 active:opacity-70"
                        >
                          <Text className="text-xs font-semibold text-stone">Reset to default</Text>
                        </Pressable>
                      )}
                    </View>
                  </>
                )}
              </View>
            );
          })}

          {!pol.reviewed && (
            <Pressable
              disabled={busy}
              onPress={() => save(current('terms'), current('release'), 'Your terms and release are set.')}
              className="bg-rally-600 rounded-xl py-3 items-center active:opacity-80"
            >
              <Text className="text-sm font-bold text-cream">Use these terms and release</Text>
            </Pressable>
          )}

          <Text className="text-[11px] text-stone text-center mt-4 leading-4">
            Families also accept RallyHUB's platform terms with yours. Those protect RallyHUB and can't be edited.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
