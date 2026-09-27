import { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Image, Switch, ActivityIndicator, Alert, Platform, Share, Linking, Modal } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { useCoachStore } from '@/stores/useCoachStore';
import { fetchMyCoach, fetchCoachPolicies, initials, isSupabaseConfigured } from '@/lib/coach';
import {
  setMyBookingPage, bookingPageUrl, qrImageUrl, embedSnippet, bookButtonSnippet,
} from '@/lib/bookingPage';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError, tapLight } from '@/lib/haptics';

const ACCENTS = ['#3B82B0', '#1E3A5F', '#7c3aed', '#0d9488', '#be185d', '#4f46e5', '#d97706', '#16a34a'];

export default function CoachBookingPageScreen() {
  const ic = useIconColors();
  const { user } = useAuth();
  const setCoachProfile = useCoachStore((s) => s.setCoachProfile);
  const [loading, setLoading] = useState(true);
  const [coach, setCoach] = useState<any>(null);
  const [agreementOk, setAgreementOk] = useState(false);
  const [published, setPublished] = useState(false);
  const [slug, setSlug] = useState('');
  const [headline, setHeadline] = useState('');
  const [accent, setAccent] = useState('#3B82B0');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [embedTheme, setEmbedTheme] = useState<'light' | 'dark'>('light');
  const [storyOpen, setStoryOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const alertMsg = (t: string, m: string) => (Platform.OS === 'web' ? window.alert(`${t}: ${m}`) : Alert.alert(t, m));

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !user) { setLoading(false); return; }
    const { data } = await fetchMyCoach(user.id);
    if (data) {
      const c = data as any;
      setCoach(c);
      setCoachProfile(data);
      setPublished(!!c.booking_page_published);
      setSlug(c.slug ?? '');
      setHeadline(c.headline ?? '');
      setAccent(c.accent_color ?? '#3B82B0');
      const pol = await fetchCoachPolicies(c.id);
      setAgreementOk(!!pol.data?.platform_agreement_accepted_at);
    }
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async (nextPublished = published) => {
    setBusy(true);
    const { data, error } = await setMyBookingPage({ published: nextPublished, slug, headline, accent });
    setBusy(false);
    if (error) { notifyError(); alertMsg("Couldn't save", error.message); return false; }
    if (data) { setSlug(data.slug); setPublished(data.published); }
    setDirty(false);
    notifySuccess();
    return true;
  };

  const togglePublish = async (v: boolean) => {
    if (v && !agreementOk) {
      alertMsg('One step first', 'Accept the Coach Platform Agreement in Terms & Release, then publish.');
      return;
    }
    const prev = published;
    setPublished(v);
    if (!(await save(v))) setPublished(prev);
  };

  const url = bookingPageUrl(slug || 'your-name');
  const copy = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    tapLight();
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };
  const shareText = `Book a private lesson with me on RallyHUB — see my open times and request one here: ${url}`;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
      <Text className="text-sm font-bold text-bark dark:text-cream mb-2">{title}</Text>
      {children}
    </View>
  );

  const CopyBtn = ({ text, k, label }: { text: string; k: string; label: string }) => (
    <Pressable onPress={() => copy(text, k)} className="flex-row items-center rounded-lg px-3 py-2 mr-2 mb-2 bg-rally-50 dark:bg-rally-900/30 active:opacity-70">
      <Ionicons name={copied === k ? 'checkmark' : 'copy-outline'} size={14} color="#3B82B0" />
      <Text className="text-xs font-semibold text-rally-600 ml-1">{copied === k ? 'Copied' : label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Booking Page</Text>
        <View className="w-6" />
      </View>

      {loading || !coach ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* Publish */}
          <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: published ? '#16a34a14' : '#3B82B014', borderWidth: 1, borderColor: published ? '#16a34a40' : '#3B82B040' }}>
            <View className="flex-row items-center">
              <View className="flex-1">
                <Text className="text-base font-bold text-bark dark:text-cream">{published ? 'Your page is live' : 'Publish your booking page'}</Text>
                <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                  {published ? 'Anyone with the link can see your open times and request one.' : 'Families see your profile, prices, and open times — and request in one tap.'}
                </Text>
              </View>
              <Switch value={published} onValueChange={togglePublish} disabled={busy} />
            </View>
            {!agreementOk && (
              <Pressable onPress={() => router.push('/coach/policies')} className="mt-2">
                <Text className="text-xs font-semibold text-rally-600">Accept the Coach Platform Agreement first →</Text>
              </Pressable>
            )}
            {published && (
              <Pressable onPress={() => (Platform.OS === 'web' ? window.open(url, '_blank') : Linking.openURL(url))} className="mt-2">
                <Text className="text-xs font-semibold text-rally-600">View your page →</Text>
              </Pressable>
            )}
          </View>

          {/* Page settings */}
          <Section title="Page details">
            <Text className="text-xs text-stone mb-1">Page address</Text>
            <View className="flex-row items-center bg-cream dark:bg-bark rounded-lg border border-parchment dark:border-rally-900 px-3 mb-3">
              <Text className="text-sm text-stone">rally-hub.com/book/</Text>
              <TextInput
                value={slug}
                onChangeText={(v) => { setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, '-')); setDirty(true); }}
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 py-2 text-sm font-semibold text-bark dark:text-cream"
              />
            </View>
            <Text className="text-xs text-stone mb-1">Headline</Text>
            <TextInput
              value={headline}
              onChangeText={(v) => { setHeadline(v); setDirty(true); }}
              placeholder="e.g. Former D1 setter · serve receive + setting"
              placeholderTextColor="#8FA8BF"
              maxLength={90}
              className="bg-cream dark:bg-bark rounded-lg px-3 py-2 text-sm text-bark dark:text-cream border border-parchment dark:border-rally-900 mb-3"
            />
            <Text className="text-xs text-stone mb-1.5">Accent color</Text>
            <View className="flex-row flex-wrap mb-1">
              {ACCENTS.map((a) => (
                <Pressable key={a} onPress={() => { setAccent(a); setDirty(true); }} className="mr-2 mb-2">
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: a, borderWidth: accent === a ? 3 : 0, borderColor: '#FEFEFE', shadowColor: '#000', shadowOpacity: accent === a ? 0.3 : 0, shadowRadius: 4 }} />
                </Pressable>
              ))}
            </View>
            <Text className="text-[11px] text-stone">Photo, bio, credentials, lessons, and times come from your listing, session types, and availability.</Text>
            {dirty && (
              <Pressable disabled={busy} onPress={() => save()} className="bg-rally-600 rounded-lg py-2.5 items-center mt-3 active:opacity-80">
                <Text className="text-sm font-bold text-cream">{busy ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            )}
          </Section>

          {/* Share */}
          <Section title="Share">
            <Text className="text-sm font-semibold text-rally-600 mb-2" selectable>{url}</Text>
            <View className="flex-row flex-wrap">
              <CopyBtn text={url} k="link" label="Copy link" />
              <Pressable onPress={() => Share.share({ message: shareText, url })} className="flex-row items-center rounded-lg px-3 py-2 mr-2 mb-2 bg-rally-50 dark:bg-rally-900/30 active:opacity-70">
                <Ionicons name="chatbubble-outline" size={14} color="#3B82B0" />
                <Text className="text-xs font-semibold text-rally-600 ml-1">Text / share</Text>
              </Pressable>
              <Pressable onPress={() => setStoryOpen(true)} className="flex-row items-center rounded-lg px-3 py-2 mr-2 mb-2 bg-rally-50 dark:bg-rally-900/30 active:opacity-70">
                <Ionicons name="logo-instagram" size={14} color="#3B82B0" />
                <Text className="text-xs font-semibold text-rally-600 ml-1">Story card</Text>
              </Pressable>
            </View>
            <View className="items-center mt-2">
              <Image source={{ uri: qrImageUrl(url, 360) }} style={{ width: 170, height: 170, borderRadius: 12 }} />
              <Text className="text-[11px] text-stone mt-1">QR code — print it for the gym or screenshot it.</Text>
            </View>
            {!published && <Text className="text-[11px] text-amber-700 mt-2 text-center">Publish your page so the link works.</Text>}
          </Section>

          {/* Embed */}
          <Section title="Add to your website">
            <Text className="text-xs text-stone dark:text-parchment mb-2">
              Paste this where you want your schedule on your site (Squarespace/Wix/WordPress: add an "Embed" or "Code" block). Requests land in RallyHUB like any other booking.
            </Text>
            <View className="flex-row mb-2">
              {(['light', 'dark'] as const).map((t) => (
                <Pressable key={t} onPress={() => setEmbedTheme(t)} className={`rounded-lg px-3 py-1.5 mr-2 border ${embedTheme === t ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-rally-900'}`}>
                  <Text className={`text-xs font-semibold ${embedTheme === t ? 'text-cream' : 'text-bark dark:text-parchment'}`}>{t === 'light' ? 'Light' : 'Dark'}</Text>
                </Pressable>
              ))}
            </View>
            <Text className="text-[11px] font-mono bg-cream dark:bg-bark rounded-lg p-2.5 text-bark dark:text-cream border border-parchment dark:border-rally-900 mb-2" selectable>
              {embedSnippet(slug || 'your-name', { theme: embedTheme, accent })}
            </Text>
            <View className="flex-row flex-wrap">
              <CopyBtn text={embedSnippet(slug, { theme: embedTheme, accent })} k="embed" label="Copy schedule embed" />
              <CopyBtn text={bookButtonSnippet(slug, accent)} k="button" label="Copy 'Book a lesson' button" />
            </View>
          </Section>
        </ScrollView>
      )}

      {/* Instagram story card — screenshot to post */}
      <Modal visible={storyOpen} animationType="fade" onRequestClose={() => setStoryOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#1E3A5F', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <Pressable onPress={() => setStoryOpen(false)} style={{ position: 'absolute', top: 54, right: 20, padding: 8 }}>
            <Ionicons name="close" size={26} color="#ffffffaa" />
          </Pressable>
          {coach?.photo_url ? (
            <Image source={{ uri: coach.photo_url }} style={{ width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: accent }} />
          ) : (
            <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800' }}>{initials(coach?.display_name ?? 'C')}</Text>
            </View>
          )}
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '900', marginTop: 18, textAlign: 'center' }}>Lessons are open</Text>
          <Text style={{ color: '#ffffffcc', fontSize: 18, marginTop: 6, textAlign: 'center' }}>{coach?.display_name}</Text>
          {headline ? <Text style={{ color: '#ffffff99', fontSize: 14, marginTop: 4, textAlign: 'center' }}>{headline}</Text> : null}
          <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 20, marginTop: 26 }}>
            <Image source={{ uri: qrImageUrl(url, 480) }} style={{ width: 210, height: 210 }} />
          </View>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 18 }}>Scan to book</Text>
          <Text style={{ color: accent === '#1E3A5F' ? '#7DBDD9' : accent, fontSize: 14, fontWeight: '700', marginTop: 4 }}>rally-hub.com/book/{slug}</Text>
          <Text style={{ color: '#ffffff66', fontSize: 12, marginTop: 30 }}>Screenshot this and post it to your story</Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
