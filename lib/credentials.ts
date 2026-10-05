import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from '@/lib/supabase';

// Credential Vault (00091): saved-login passwords are encrypted in Supabase
// Vault. The app never holds them in its data; it asks for one password at a
// time, for the family that owns it, and on iPhone only after Face ID.

export interface VaultRef { configId: string; credId?: string | null; hasPassword?: boolean | null }

const cache = new Map<string, { pw: string; at: number }>();
const TTL = 2 * 60 * 1000;          // keep a revealed password in memory for 2 minutes
let unlockedAt = 0;                 // one Face ID check covers a short burst of copies
const UNLOCK_WINDOW = 60 * 1000;

/** Face ID / passcode on iPhone; nothing extra on the website. Returns false if cancelled. */
export async function confirmIdentity(reason = 'Show your saved password'): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  if (Date.now() - unlockedAt < UNLOCK_WINDOW) return true;
  try {
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hasHw && (await LocalAuthentication.isEnrolledAsync());
    if (!enrolled) return true; // no Face ID/passcode set up on this phone
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason, fallbackLabel: 'Use passcode' });
    if (r.success) unlockedAt = Date.now();
    return r.success;
  } catch {
    return false;
  }
}

/** Decrypt one saved password. Returns null if cancelled, missing, or not allowed. */
export async function revealPassword(ref: VaultRef): Promise<string | null> {
  if (!ref.credId || !ref.hasPassword) return null;
  const key = `${ref.configId}:${ref.credId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.pw;
  if (!(await confirmIdentity())) return null;
  const { data, error } = await (supabase.rpc as any)('get_credential_password', { p_config_id: ref.configId, p_cred_id: ref.credId });
  if (error || typeof data !== 'string') return null;
  cache.set(key, { pw: data, at: Date.now() });
  return data;
}

/** Remove a saved password (the login's other fields stay). */
export async function clearSavedPassword(ref: VaultRef): Promise<{ error: Error | null }> {
  if (!ref.credId) return { error: null };
  cache.delete(`${ref.configId}:${ref.credId}`);
  const { error } = await (supabase.rpc as any)('clear_credential_password', { p_config_id: ref.configId, p_cred_id: ref.credId });
  return { error: error ?? null };
}

/** A login's vault reference (for the tile and editor). */
export const vaultRefFor = (configId: string | null | undefined, link: { cred_id?: string | null; has_password?: boolean | null }): VaultRef | undefined =>
  configId ? { configId, credId: link.cred_id ?? null, hasPassword: !!link.has_password } : undefined;
