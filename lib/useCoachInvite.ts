import { useEffect, useRef } from 'react';
import { Platform, Share } from 'react-native';
import { createCoachInvite, coachInviteMessage } from '@/lib/coachInvites';
import { showToast } from '@/components/Toast';
import { useAuth } from '@/providers/AuthProvider';

// One personal invite code per athlete per app session, created ahead of the
// tap: browsers only allow sharing/copying right after a tap, and waiting on
// the server first used up that window (the button "did nothing" on the web).
const codes = new Map<string, Promise<string | null>>();
const codeFor = (athleteId: string | null) => {
  const key = athleteId ?? 'family';
  if (!codes.has(key)) {
    const p = createCoachInvite(athleteId).catch(() => null);
    // Never remember a failure (e.g. called before sign-in finished restoring).
    p.then((c) => { if (!c) codes.delete(key); });
    codes.set(key, p);
  }
  return codes.get(key)!;
};

/** "Invite your coach": share sheet on iPhone; share menu or instant copy on the web. */
export function useCoachInvite(athletes: { id: string; first_name: string }[], refreshKey?: unknown) {
  const { user } = useAuth();
  const athleteId = athletes.length === 1 ? athletes[0].id : null;
  const who = athletes.length === 1 ? athletes[0].first_name
    : athletes.length > 1 ? athletes.map((a) => a.first_name).join(' and ') : 'our athlete';
  const ready = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return; // wait for the signed-in session
    let live = true;
    codeFor(athleteId).then((c) => { if (live && c) ready.current = c; });
    return () => { live = false; };
  }, [athleteId, user?.id, refreshKey]);

  /** Returns how it was sent: 'shared' | 'copied' | 'shown' | 'cancelled'. */
  return async function invite(): Promise<'shared' | 'copied' | 'shown' | 'cancelled'> {
    if (Platform.OS !== 'web') {
      const code = ready.current ?? (await codeFor(athleteId));
      const r = await Share.share({ message: coachInviteMessage(who, code) });
      return r.action === Share.sharedAction ? 'shared' : 'cancelled';
    }
    // Web: no awaits before share/copy, so the browser still counts this as the tap.
    const message = coachInviteMessage(who, ready.current);
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (nav?.share) {
      try { await nav.share({ text: message }); return 'shared'; }
      catch (e: any) { if (e?.name === 'AbortError') return 'cancelled'; }
    }
    try {
      await nav.clipboard.writeText(message);
      showToast('Invite copied — paste it into a text to your coach');
      return 'copied';
    } catch {
      // Copy blocked: show the text so it can be copied by hand.
      window.prompt('Copy this invite and text it to your coach:', message);
      return 'shown';
    }
  };
}
