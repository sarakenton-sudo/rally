import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import FormField from '@/components/FormField';
import { useSeasonStore } from '@/stores/useSeasonStore';
import { useAuth } from '@/providers/AuthProvider';
import { updateAdminConfig } from '@/hooks/useSupabaseData';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useIconColors } from '@/lib/colors';
import { tapLight, notifySuccess } from '@/lib/haptics';
import { showToast } from '@/components/Toast';
import { trackEvent } from '@/lib/track-event';

/**
 * "Save a login or code" (was "Add Link" / "Save a credential").
 * Quick-pick platform chips decide which fields show; "whose is it" is a field
 * (Mine · each athlete). Team code saves to the chosen team (seasons.team_code).
 *
 * NOTE: passwords are still stored as plain text in admin_config.external_links —
 * encryption is a planned follow-up (see memory: credential-encryption-todo).
 */

type PlatformKey = 'usav' | 'aes' | 'leagueapps' | 'sportsrecruits' | 'ua' | 'groupme' | 'team_code' | 'other';
type Fields = { url: boolean; username: string | null; password: boolean };

const PLATFORMS: { key: PlatformKey; label: string; match: string[]; url?: string; icon: string; fields: Fields }[] = [
  { key: 'usav', label: 'USA Volleyball', match: ['usa volleyball', 'usav'], icon: 'shield-checkmark', fields: { url: false, username: 'Member ID', password: false } },
  { key: 'aes', label: 'AES / SportsEngine', match: ['aes', 'sportsengine', 'advanced event'], url: 'https://www.advancedeventsystems.com', icon: 'globe-outline', fields: { url: true, username: 'Email or username', password: true } },
  { key: 'leagueapps', label: 'LeagueApps', match: ['leagueapps'], url: 'https://leagueapps.com', icon: 'trophy-outline', fields: { url: true, username: 'Email or username', password: true } },
  { key: 'sportsrecruits', label: 'Sports Recruits', match: ['sportsrecruits', 'sports recruits'], url: 'https://my.sportsrecruits.com/login', icon: 'school-outline', fields: { url: true, username: 'Email or username', password: true } },
  { key: 'ua', label: 'University Athlete', match: ['university athlete'], url: 'https://universityathlete.com', icon: 'trophy-outline', fields: { url: true, username: 'Email or username', password: true } },
  { key: 'groupme', label: 'GroupMe', match: ['groupme'], url: 'https://web.groupme.com', icon: 'chatbubbles-outline', fields: { url: true, username: null, password: false } },
  { key: 'team_code', label: 'Team code', match: [], icon: 'key-outline', fields: { url: false, username: null, password: false } },
  { key: 'other', label: 'Other', match: [], icon: 'globe-outline', fields: { url: true, username: 'Email or username', password: true } },
];

function platformFor(label: string): PlatformKey {
  const lower = label.toLowerCase();
  return PLATFORMS.find((p) => p.match.some((m) => lower.includes(m)))?.key ?? 'other';
}

export default function EditLinkScreen() {
  const { index: indexStr, newLabel, athleteId, raw } = useLocalSearchParams<{ index?: string; newLabel?: string; athleteId?: string; raw?: string }>();
  const editIndex = indexStr != null ? parseInt(indexStr) : -1;
  const adminConfig = useSeasonStore((s) => s.adminConfig);
  const setAdminConfig = useSeasonStore((s) => s.setAdminConfig);
  const athletes = useSeasonStore((s) => s.athletes);
  const seasons = useSeasonStore((s) => s.seasons);
  const setSeasons = useSeasonStore((s) => s.setSeasons);
  const activeSeasonId = useSeasonStore((s) => s.activeSeasonId);
  const { user } = useAuth();
  const ic = useIconColors();
  const existingLink = editIndex >= 0 ? adminConfig?.external_links[editIndex] : null;

  const [platform, setPlatform] = useState<PlatformKey>(() => (existingLink || newLabel ? platformFor(existingLink?.label ?? newLabel ?? '') : 'other'));
  const [label, setLabel] = useState(existingLink?.label ?? newLabel ?? '');
  const [url, setUrl] = useState(existingLink?.url ?? '');
  const [username, setUsername] = useState(existingLink?.username ?? '');
  const [password, setPassword] = useState(existingLink?.password ?? '');
  // Whose is it: 'me' (parent) or an athlete id. Default to the parent (spec §3.4).
  const [owner, setOwner] = useState<string>(existingLink?.scope === 'athlete' && existingLink.athlete_id ? existingLink.athlete_id : athleteId ?? 'me');
  // Team code: which team (season) it belongs to.
  const [seasonId, setSeasonId] = useState<string>(activeSeasonId ?? seasons[0]?.id ?? '');
  const [teamCode, setTeamCode] = useState(seasons.find((s) => s.id === (activeSeasonId ?? seasons[0]?.id))?.team_code ?? '');
  const [showRaw, setShowRaw] = useState(true);

  const spec = PLATFORMS.find((p) => p.key === platform)!;
  const isEdit = editIndex >= 0;

  const choosePlatform = (key: PlatformKey) => {
    tapLight();
    setPlatform(key);
    const p = PLATFORMS.find((x) => x.key === key)!;
    if (key !== 'other' && key !== 'team_code') setLabel(p.label);
    else if (key === 'other' && PLATFORMS.some((x) => x.label === label)) setLabel('');
    if (p.url && !url) setUrl(p.url);
  };

  const handleCopy = async (value: string, fieldLabel: string) => {
    await Clipboard.setStringAsync(value);
    tapLight();
    showToast(`${fieldLabel} copied`);
  };

  const done = (viewPath: string | null) => {
    notifySuccess();
    if (user) trackEvent(user.id, 'credential_saved', { owner: owner === 'me' ? 'parent' : 'athlete', platform });
    router.back();
    showToast('Saved', viewPath ? { actionLabel: 'View', onAction: () => router.push(viewPath as any) } : {});
  };

  const saveTeamCode = async () => {
    if (!seasonId) { Alert.alert('Pick a team', 'Choose which team this code is for.'); return; }
    const code = teamCode.trim() || null;
    if (isSupabaseConfigured && user) {
      const { error } = await (supabase.from('seasons') as any).update({ team_code: code }).eq('id', seasonId);
      if (error) { Alert.alert('Save failed', error.message); return; }
    }
    setSeasons(seasons.map((s) => (s.id === seasonId ? { ...s, team_code: code } : s)));
    done('/(tabs)/season');
  };

  const handleSave = async () => {
    if (platform === 'team_code') return saveTeamCode();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) { Alert.alert('Missing name', 'What is this login for? (e.g. LeagueApps)'); return; }
    if (!adminConfig) return;

    const toAthlete = owner !== 'me';
    const linkData = {
      label: trimmedLabel,
      url: spec.fields.url ? url.trim() : '',
      icon_name: spec.icon,
      username: spec.fields.username ? username.trim() || null : null,
      password: spec.fields.password ? password.trim() || null : null,
      scope: (toAthlete ? 'athlete' : 'admin') as 'athlete' | 'admin',
      athlete_id: toAthlete ? owner : null,
    };
    const updatedLinks = [...adminConfig.external_links];
    if (isEdit) updatedLinks[editIndex] = linkData; else updatedLinks.push(linkData);
    const updates = { external_links: updatedLinks };

    if (isSupabaseConfigured && user) {
      const { error } = await updateAdminConfig(adminConfig.id, updates);
      if (error) { Alert.alert('Save failed', error.message); return; }
    }
    setAdminConfig({ ...adminConfig, ...updates });
    done(toAthlete ? `/athlete/${owner}` : '/(tabs)');
  };

  const handleDelete = () => {
    if (!isEdit || !adminConfig) return;
    Alert.alert('Remove', `Remove "${existingLink?.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const updates = { external_links: adminConfig.external_links.filter((_, i) => i !== editIndex) };
          if (isSupabaseConfigured && user) await updateAdminConfig(adminConfig.id, updates);
          setAdminConfig({ ...adminConfig, ...updates });
          router.back();
        },
      },
    ]);
  };

  const Chip = ({ on, label: l, onPress }: { on: boolean; label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} className={`rounded-full px-3 py-1.5 mr-2 mb-2 border ${on ? 'bg-rally-600 border-rally-600' : 'border-parchment dark:border-rally-900'}`} accessibilityLabel={l}>
      <Text className={`text-xs font-semibold ${on ? 'text-cream' : 'text-bark dark:text-parchment'}`}>{l}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView className="flex-1 bg-warm-white dark:bg-bark" edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light">
          <Pressable onPress={() => router.back()} className="p-1" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={ic.muted} />
          </Pressable>
          <Text className="text-lg font-bold text-bark dark:text-cream">{isEdit ? 'Edit login or code' : 'Save a login or code'}</Text>
          <Pressable onPress={handleSave} className="bg-rally-600 px-4 py-1.5 rounded-lg active:opacity-80">
            <Text className="text-sm font-semibold text-cream">Save</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4 pt-4" keyboardShouldPersistTaps="handled">
          {/* Raw text from an unclassified paste */}
          {raw ? (
            <View className="bg-cream dark:bg-bark-light rounded-xl p-3 mb-4 border border-parchment dark:border-rally-900">
              <Pressable onPress={() => setShowRaw(!showRaw)} className="flex-row items-center">
                <Ionicons name={showRaw ? 'chevron-down' : 'chevron-forward'} size={14} color="#3B82B0" />
                <Text className="text-xs font-semibold text-rally-600 ml-1">From your paste</Text>
              </Pressable>
              {showRaw && <Text className="text-xs text-bark dark:text-cream mt-2" selectable numberOfLines={12}>{raw}</Text>}
            </View>
          ) : null}

          {/* Platform quick-picks */}
          <View className="flex-row flex-wrap mb-2">
            {PLATFORMS.map((p) => <Chip key={p.key} on={platform === p.key} label={p.label} onPress={() => choosePlatform(p.key)} />)}
          </View>

          {platform === 'team_code' ? (
            <>
              <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">Which team?</Text>
              <View className="flex-row flex-wrap mb-3">
                {seasons.map((s) => {
                  const a = athletes.find((x) => x.id === s.athlete_id);
                  return (
                    <Chip
                      key={s.id}
                      on={seasonId === s.id}
                      label={`${athletes.length > 1 && a ? `${a.first_name} · ` : ''}${s.team_name} (${s.season_year})`}
                      onPress={() => { setSeasonId(s.id); setTeamCode(s.team_code ?? ''); }}
                    />
                  );
                })}
              </View>
              <FormField label="Team code" value={teamCode} onChangeText={setTeamCode} placeholder="e.g. AJV14U" autoCapitalize="characters" autoCorrect={false} />
              <Text className="text-xs text-stone mb-4">Shown on the Season tab and shared with family for tickets and check-in.</Text>
            </>
          ) : (
            <>
              {/* Whose is it? */}
              <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">Whose is it?</Text>
              <View className="flex-row flex-wrap mb-3">
                <Chip on={owner === 'me'} label="Mine" onPress={() => setOwner('me')} />
                {athletes.map((a) => <Chip key={a.id} on={owner === a.id} label={a.first_name} onPress={() => setOwner(a.id)} />)}
              </View>

              {platform === 'other' && (
                <FormField label="Name" value={label} onChangeText={setLabel} placeholder="e.g. Hudl, club website" />
              )}
              {spec.fields.url && (
                <FormField label="Link" value={url} onChangeText={setUrl} placeholder="https://..." keyboardType="url" autoCapitalize="none" />
              )}
              {spec.fields.username && (
                <View className="flex-row items-end">
                  <View className="flex-1 mr-2">
                    <FormField label={spec.fields.username} value={username} onChangeText={setUsername} placeholder={spec.fields.username} autoCapitalize="none" autoCorrect={false} />
                  </View>
                  {username ? (
                    <Pressable onPress={() => handleCopy(username, spec.fields.username!)} className="bg-cream dark:bg-bark-light rounded-xl p-3 mb-4 active:opacity-70">
                      <Ionicons name="copy-outline" size={18} color="#3B82B0" />
                    </Pressable>
                  ) : null}
                </View>
              )}
              {spec.fields.password && (
                <View className="flex-row items-end">
                  <View className="flex-1 mr-2">
                    <FormField label="Password" value={password} onChangeText={setPassword} placeholder="password" secureTextEntry autoCapitalize="none" />
                  </View>
                  {password ? (
                    <Pressable onPress={() => handleCopy(password, 'Password')} className="bg-cream dark:bg-bark-light rounded-xl p-3 mb-4 active:opacity-70">
                      <Ionicons name="copy-outline" size={18} color="#3B82B0" />
                    </Pressable>
                  ) : null}
                </View>
              )}
            </>
          )}

          {isEdit && (
            <Pressable className="mt-4 mb-8 py-3 items-center rounded-xl border border-red-200 dark:border-red-800 active:opacity-80" onPress={handleDelete}>
              <Text className="text-sm font-semibold text-red-600">Remove</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
