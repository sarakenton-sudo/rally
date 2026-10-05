import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { revealPassword, clearSavedPassword, vaultRefFor } from '@/lib/credentials';
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
import {
  PLATFORMS, FAMILY_LABEL, platformFor, platformSpec, ownerKind, allowedOwners, defaultOwner, type PlatformKey, type Owner,
} from '@/lib/loginPlatforms';

/**
 * "Save a login or code" (was "Add Link" / "Save a credential").
 * Quick-pick platform chips decide which fields show and who the login belongs
 * to (lib/loginPlatforms): family logins (GroupMe, LeagueApps…) default to
 * "Family (all athletes)"; athlete logins (Sports Recruits, USAV…) must be
 * one athlete. Team code saves to the chosen team (seasons.team_code).
 *
 * Passwords are encrypted in the Credential Vault (00091): a typed password is
 * sent once and the server moves it into Supabase Vault; existing ones are
 * revealed on request (Face ID on iPhone) and never held in the link data.
 */

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
  const [password, setPassword] = useState('');           // only a NEW password is ever typed here
  const [savedPw, setSavedPw] = useState(!!existingLink?.has_password);
  const [shownPw, setShownPw] = useState<string | null>(null);
  const vault = existingLink && adminConfig ? vaultRefFor(adminConfig.id, existingLink) : undefined;
  // Whose is it: 'family' or an athlete id. An existing login keeps its owner;
  // a new one gets the platform's default until the parent picks.
  const [owner, setOwner] = useState<Owner>(() => existingLink
    ? (existingLink.scope === 'athlete' && existingLink.athlete_id ? existingLink.athlete_id : 'family')
    : defaultOwner({ platformKey: platform, athletes, athleteIdParam: athleteId }));
  const [ownerPicked, setOwnerPicked] = useState(!!existingLink);
  const [error, setError] = useState<string | null>(null);
  // Team code: which team (season) it belongs to.
  const [seasonId, setSeasonId] = useState<string>(activeSeasonId ?? seasons[0]?.id ?? '');
  const [teamCode, setTeamCode] = useState(seasons.find((s) => s.id === (activeSeasonId ?? seasons[0]?.id))?.team_code ?? '');
  const [showRaw, setShowRaw] = useState(true);

  const spec = platformSpec(platform);
  const isEdit = editIndex >= 0;
  const athleteOnly = ownerKind(platform) === 'athlete';
  const ownerOk = owner !== null && allowedOwners(platform, athletes).includes(owner);
  const pickOwner = (o: Owner) => { tapLight(); setOwner(o); setOwnerPicked(true); setError(null); };

  const choosePlatform = (key: PlatformKey) => {
    tapLight();
    setPlatform(key);
    setError(null);
    // Apply the platform's default owner unless the parent already chose one
    // (and that choice still fits, e.g. not Family on an athlete-only login).
    setOwner((cur) => defaultOwner({ platformKey: key, athletes, athleteIdParam: athleteId, current: ownerPicked ? cur : null }));
    const p = platformSpec(key);
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
    if (user) trackEvent(user.id, 'credential_saved', { owner: owner === 'family' ? 'family' : 'athlete', platform });
    router.back();
    showToast('Saved', viewPath ? { actionLabel: 'View', onAction: () => router.push(viewPath as any) } : {});
  };

  const saveTeamCode = async () => {
    if (!seasonId) { setError('Choose which team this code is for.'); return; }
    const code = teamCode.trim() || null;
    if (isSupabaseConfigured && user) {
      const { error } = await (supabase.from('seasons') as any).update({ team_code: code }).eq('id', seasonId);
      if (error) { setError(`Save failed: ${error.message}`); return; }
    }
    setSeasons(seasons.map((s) => (s.id === seasonId ? { ...s, team_code: code } : s)));
    done('/(tabs)/season');
  };

  const handleSave = async () => {
    if (platform === 'team_code') return saveTeamCode();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) { setError('What is this login for? (e.g. LeagueApps)'); return; }
    if (!ownerOk) {
      setError(athleteOnly ? `${spec.label} belongs to one athlete. Choose whose it is.` : 'Choose whose login this is.');
      return;
    }
    if (!adminConfig) return;

    const toAthlete = owner !== 'family';
    const linkData = {
      // Keep the vault id (cred_id/has_password) of an existing login.
      ...(isEdit && existingLink ? { cred_id: existingLink.cred_id ?? null, has_password: savedPw } : {}),
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
      if (error) { setError(`Save failed: ${error.message}`); return; }
      // Reload what the server stored: the password is now encrypted and stripped.
      const { data: fresh } = await (supabase.from('admin_config') as any).select('*').eq('id', adminConfig.id).single();
      setAdminConfig(fresh ?? { ...adminConfig, ...updates, external_links: updatedLinks.map((l) => ({ ...l, password: null })) });
    } else {
      setAdminConfig({ ...adminConfig, ...updates });
    }
    done(toAthlete ? `/athlete/${owner}` : '/(tabs)');
  };

  const handleDelete = () => {
    if (!isEdit || !adminConfig) return;
    const remove = async () => {
      const updates = { external_links: adminConfig.external_links.filter((_, i) => i !== editIndex) };
      if (isSupabaseConfigured && user) await updateAdminConfig(adminConfig.id, updates);
      setAdminConfig({ ...adminConfig, ...updates });
      router.back();
    };
    // Alert.alert is a no-op on web, so confirm with the browser dialog there.
    if (Platform.OS === 'web') { if (window.confirm(`Remove "${existingLink?.label}"?`)) remove(); return; }
    Alert.alert('Remove', `Remove "${existingLink?.label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: remove },
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
          {error ? (
            <View className="flex-row items-start rounded-xl p-3 mb-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" accessibilityRole="alert">
              <Ionicons name="alert-circle" size={16} color="#dc2626" style={{ marginTop: 1 }} />
              <Text className="text-xs font-semibold text-red-700 dark:text-red-300 ml-1.5 flex-1">{error}</Text>
            </View>
          ) : null}
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
              <View className="flex-row flex-wrap mb-1">
                {!athleteOnly && <Chip on={owner === 'family'} label={FAMILY_LABEL} onPress={() => pickOwner('family')} />}
                {athletes.map((a) => <Chip key={a.id} on={owner === a.id} label={a.first_name} onPress={() => pickOwner(a.id)} />)}
              </View>
              <Text className={`text-xs mb-3 ${athleteOnly && !ownerOk ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-stone'}`}>
                {athleteOnly
                  ? (ownerOk ? `${spec.label} belongs to one athlete.`
                    : isEdit && owner === 'family' ? `${spec.label} belongs to one athlete. Choose whose it is to save.`
                    : `${spec.label} belongs to one athlete. Choose whose it is.`)
                  : owner === 'family' ? 'One login for the whole family. Co-parents see it too.'
                  : 'Saved on this athlete\'s page.'}
              </Text>

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
              {spec.fields.password && savedPw && !password ? (
                <View className="bg-cream dark:bg-bark-light rounded-xl p-3 mb-2 border border-parchment dark:border-rally-900">
                  <View className="flex-row items-center">
                    <Ionicons name="lock-closed" size={15} color="#16a34a" />
                    <Text className="text-sm font-semibold text-bark dark:text-cream ml-1.5 flex-1">
                      {shownPw ?? 'Password saved (encrypted)'}
                    </Text>
                    {!shownPw ? (
                      <Pressable onPress={async () => { if (vault) setShownPw(await revealPassword(vault)); }} className="px-2 py-1" accessibilityLabel="Show saved password">
                        <Text className="text-xs font-bold text-rally-600">Show</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={() => handleCopy(shownPw, 'Password')} className="px-2 py-1" accessibilityLabel="Copy password">
                        <Ionicons name="copy-outline" size={16} color="#3B82B0" />
                      </Pressable>
                    )}
                    <Pressable
                      onPress={async () => {
                        if (!vault) return;
                        const { error } = await clearSavedPassword(vault);
                        if (error) { setError(`Couldn't remove the password: ${error.message}`); return; }
                        setSavedPw(false); setShownPw(null);
                      }}
                      className="px-2 py-1"
                      accessibilityLabel="Remove saved password"
                    >
                      <Text className="text-xs font-semibold text-stone">Remove</Text>
                    </Pressable>
                  </View>
                  <Text className="text-[11px] text-stone dark:text-parchment mt-1">Type below to replace it.</Text>
                </View>
              ) : null}
              {spec.fields.password && (
                <View className="flex-row items-end">
                  <View className="flex-1 mr-2">
                    <FormField label={savedPw ? 'New password' : 'Password'} value={password} onChangeText={setPassword} placeholder={savedPw ? 'Leave blank to keep the saved one' : 'password'} secureTextEntry autoCapitalize="none" />
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
