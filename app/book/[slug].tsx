import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, ActivityIndicator, Platform, Linking } from 'react-native';
import { APP_STORE_URL } from '@/lib/fan';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/providers/AuthProvider';
import { sessionKindStyle, fmtMoney, initials } from '@/lib/coach';
import {
  fetchBookingPage, connectViaBookingPage, rememberNextPath, bookingPageUrl, type BookingPageData,
} from '@/lib/bookingPage';

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

/**
 * Public coach booking page: rally-hub.com/book/<slug>. Works logged out.
 * ?embed=1&theme=light|dark&accent=RRGGBB renders chrome-less for an iframe on
 * the coach's site; "Request" then opens the full page in a new tab.
 */
export default function PublicBookingPage() {
  const { slug, slot: preselect, embed, theme, accent: accentParam } = useLocalSearchParams<{
    slug: string; slot?: string; embed?: string; theme?: string; accent?: string;
  }>();
  const { session } = useAuth();
  const [page, setPage] = useState<BookingPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(preselect ?? null);
  const [kind, setKind] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isEmbed = embed === '1';
  const dark = theme === 'dark';
  const accent = accentParam && /^[0-9a-fA-F]{6}$/.test(accentParam) ? `#${accentParam}` : page?.coach.accent_color || '#3B82B0';
  const bg = dark ? '#0F1E2E' : '#F4F6F8';
  const card = dark ? '#16293D' : '#FFFFFF';
  const ink = dark ? '#F4F6F8' : '#1E3A5F';
  const muted = dark ? '#9FB3C8' : '#6B8BA8';
  const line = dark ? '#23405C' : '#D8E2EC';

  useEffect(() => {
    if (!slug) return;
    fetchBookingPage(slug).then((d) => { setPage(d); setLoading(false); });
  }, [slug]);

  useEffect(() => {
    if (Platform.OS === 'web' && page) document.title = `Book a lesson with ${page.coach.display_name} · RallyHUB`;
  }, [page]);

  const typesById = useMemo(() => new Map((page?.session_types ?? []).map((t) => [t.id, t])), [page]);
  const facilityById = useMemo(() => new Map((page?.facilities ?? []).map((f) => [f.id, f])), [page]);
  const slotTypes = (s: BookingPageData['slots'][number]) =>
    (s.eligible_session_type_ids?.length ? s.eligible_session_type_ids.map((id) => typesById.get(id)).filter(Boolean) : page?.session_types ?? []) as BookingPageData['session_types'];

  const kinds = useMemo(() => [...new Set((page?.session_types ?? []).map((t) => t.kind))], [page]);
  const days = useMemo(() => {
    const out: { key: string; label: string; slots: BookingPageData['slots'] }[] = [];
    for (const s of page?.slots ?? []) {
      if (kind !== 'all' && !slotTypes(s).some((t) => t.kind === kind)) continue;
      const key = new Date(s.starts_at).toDateString();
      const g = out.find((d) => d.key === key);
      if (g) g.slots.push(s); else out.push({ key, label: fmtDay(s.starts_at), slots: [s] });
    }
    return out;
  }, [page, kind]);

  const chosen = page?.slots.find((s) => s.id === selected) ?? null;

  const request = async () => {
    if (!page || !chosen) return;
    setErr(null);
    const back = `/book/${page.coach.slug}?slot=${chosen.id}`;
    if (isEmbed && Platform.OS === 'web') { window.open(`${bookingPageUrl(page.coach.slug)}?slot=${chosen.id}`, '_blank'); return; }
    if (!session) {
      rememberNextPath(back);
      router.push('/auth?signup=true');
      return;
    }
    setBusy(true);
    const { coachId, error } = await connectViaBookingPage(page.coach.slug);
    setBusy(false);
    if (error || !coachId) { setErr(error?.message ?? 'Something went wrong. Try again.'); return; }
    router.push({ pathname: '/coaching/book', params: { slotId: chosen.id, coachId } });
  };

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={accent} /></View>;
  }
  if (!page) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Ionicons name="calendar-clear-outline" size={40} color={muted} />
        <Text style={{ color: ink, fontSize: 18, fontWeight: '700', marginTop: 12 }}>Booking page not found</Text>
        <Text style={{ color: muted, fontSize: 14, marginTop: 4, textAlign: 'center' }}>Check the link with your coach — they may not have published it yet.</Text>
      </View>
    );
  }

  const c = page.coach;
  const badges = [
    c.safesport_status === 'verified' ? { icon: 'shield-checkmark' as const, label: 'SafeSport verified' } : c.safesport_status === 'self_attested' ? { icon: 'shield-outline' as const, label: 'SafeSport (self-reported)' } : null,
    c.identity_verified ? { icon: 'finger-print' as const, label: 'ID verified by Stripe' } : null,
    ...(c.certifications ?? []).map((x) => ({ icon: 'ribbon-outline' as const, label: x.label })),
  ].filter(Boolean) as { icon: keyof typeof Ionicons.glyphMap; label: string }[];

  const body = (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: chosen ? 120 : 40, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        {/* Coach header */}
        <View style={{ backgroundColor: card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: line, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {c.photo_url ? (
              <Image source={{ uri: c.photo_url }} style={{ width: 72, height: 72, borderRadius: 36 }} />
            ) : (
              <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{initials(c.display_name)}</Text>
              </View>
            )}
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={{ color: ink, fontSize: 22, fontWeight: '800' }}>{c.display_name}</Text>
              {c.headline ? <Text style={{ color: ink, fontSize: 14, marginTop: 2 }}>{c.headline}</Text> : null}
              <Text style={{ color: muted, fontSize: 13, marginTop: 2 }}>
                {[c.sport ? c.sport[0].toUpperCase() + c.sport.slice(1) : null, c.primary_city].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
          {badges.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 }}>
              {badges.map((b) => (
                <View key={b.label} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: accent + '1A', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6 }}>
                  <Ionicons name={b.icon} size={13} color={accent} />
                  <Text style={{ color: accent, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>{b.label}</Text>
                </View>
              ))}
            </View>
          )}
          {c.bio ? <Text style={{ color: ink, fontSize: 14, lineHeight: 21, marginTop: 12 }}>{c.bio}</Text> : null}
          {(c.specialties ?? []).length > 0 && (
            <Text style={{ color: muted, fontSize: 13, marginTop: 8 }}>Specialties: {(c.specialties ?? []).join(', ')}</Text>
          )}
        </View>

        {/* Lessons + prices */}
        <Text style={{ color: muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}>Lessons</Text>
        <View style={{ backgroundColor: card, borderRadius: 16, borderWidth: 1, borderColor: line, marginBottom: 14 }}>
          {page.session_types.map((t, i) => {
            const st = sessionKindStyle(t.kind);
            return (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: line }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: st.color + '1F', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <Ionicons name={st.icon} size={18} color={st.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: ink, fontSize: 15, fontWeight: '700' }}>{t.name}</Text>
                  <Text style={{ color: muted, fontSize: 12 }}>
                    {t.duration_min} min{t.capacity > 1 ? ` · up to ${t.capacity} athletes` : ''}{t.description ? ` · ${t.description}` : ''}
                  </Text>
                </View>
                <Text style={{ color: st.color, fontSize: 16, fontWeight: '800' }}>{fmtMoney(t.price_cents)}{t.capacity > 1 ? '/athlete' : ''}</Text>
              </View>
            );
          })}
        </View>

        {/* Availability */}
        <Text style={{ color: muted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}>Open times</Text>
        {kinds.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {['all', ...kinds].map((k) => {
              const on = kind === k;
              const color = k === 'all' ? accent : sessionKindStyle(k).color;
              return (
                <Pressable key={k} onPress={() => setKind(k)} style={{ backgroundColor: on ? color : 'transparent', borderColor: color, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 }}>
                  <Text style={{ color: on ? '#fff' : color, fontSize: 12, fontWeight: '700' }}>{k === 'all' ? 'All' : sessionKindStyle(k).label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {days.length === 0 ? (
          <View style={{ backgroundColor: card, borderRadius: 16, borderWidth: 1, borderColor: line, padding: 20, alignItems: 'center' }}>
            <Text style={{ color: ink, fontWeight: '700' }}>No open times right now</Text>
            <Text style={{ color: muted, fontSize: 13, marginTop: 4, textAlign: 'center' }}>New times are added regularly — check back soon.</Text>
          </View>
        ) : days.map((d) => (
          <View key={d.key} style={{ marginBottom: 12 }}>
            <Text style={{ color: ink, fontSize: 13, fontWeight: '700', marginBottom: 6, marginLeft: 4 }}>{d.label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {d.slots.map((s) => {
                const on = selected === s.id;
                const types = slotTypes(s);
                const from = types.length ? Math.min(...types.map((t) => t.price_cents)) : null;
                const fac = s.facility_id ? facilityById.get(s.facility_id) : null;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setSelected(on ? null : s.id)}
                    style={{ backgroundColor: on ? accent : card, borderColor: on ? accent : line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginRight: 8, marginBottom: 8, minWidth: 150 }}
                  >
                    <Text style={{ color: on ? '#fff' : ink, fontSize: 15, fontWeight: '800' }}>{fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}</Text>
                    <Text style={{ color: on ? '#ffffffCC' : muted, fontSize: 12, marginTop: 1 }}>
                      {[types.map((t) => t.name).join(' / '), fac?.city || fac?.label].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={{ color: on ? '#fff' : accent, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                      {from !== null ? `${types.length > 1 ? 'from ' : ''}${fmtMoney(from)}` : ''}{s.seats_total > 1 ? ` · ${s.seats_left} spot${s.seats_left === 1 ? '' : 's'} left` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={{ color: muted, fontSize: 12, textAlign: 'center', marginTop: 16 }}>
          {c.accepts_payments ? 'Pay securely in the app · ' : ''}Booked through <Text style={{ fontWeight: '800', color: ink }}>RallyHUB</Text>
        </Text>
      </ScrollView>

      {/* Request bar */}
      {chosen && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: card, borderTopWidth: 1, borderTopColor: line, padding: 14 }}>
          {err ? <Text style={{ color: '#dc2626', fontSize: 13, marginBottom: 6, textAlign: 'center' }}>{err}</Text> : null}
          <Pressable onPress={request} disabled={busy} style={{ backgroundColor: accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center', maxWidth: 520, width: '100%', alignSelf: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
              {busy ? 'One moment…' : `Request ${new Date(chosen.starts_at).toLocaleDateString(undefined, { weekday: 'short' })} ${fmtTime(chosen.starts_at)}`}
            </Text>
          </Pressable>
          <Text style={{ color: muted, fontSize: 11, textAlign: 'center', marginTop: 6 }}>
            {session || isEmbed ? `${c.display_name} confirms before anything is charged.` : 'Free RallyHUB account needed — takes a minute.'}
          </Text>
        </View>
      )}
    </View>
  );

  return isEmbed ? body : (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: line, backgroundColor: card }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Text style={{ color: ink, fontSize: 18, fontWeight: '800' }}>Rally<Text style={{ color: accent }}>HUB</Text></Text>
        </Pressable>
        {!session && (
          <Pressable onPress={() => { rememberNextPath(`/book/${c.slug}`); router.push('/auth'); }}>
            <Text style={{ color: accent, fontWeight: '700' }}>Log in</Text>
          </Pressable>
        )}
      </View>
      {/* Drive app downloads from the web (not in iframe embeds). */}
      {Platform.OS === 'web' && (
        <Pressable
          onPress={() => Linking.openURL(APP_STORE_URL)}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: accent }}
          accessibilityLabel="Get the free RallyHUB app"
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 }}>Get the free RallyHUB app for lesson reminders and game-day alerts</Text>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Get it ›</Text>
        </Pressable>
      )}
      {body}
    </SafeAreaView>
  );
}
