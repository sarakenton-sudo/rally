import { Platform, Share } from 'react-native';
import { createFanInvite, emailFanInvite, fanInviteMessage } from '@/lib/fan';
import { showToast } from '@/components/Toast';

/**
 * Invite a guest to follow the family in the RallyHUB app (fan account).
 * Emails them if we have an address; shares (iPhone) or copies (web) the link.
 * On the web the copy happens after a server round-trip, which some browsers
 * block — then the text is shown to copy by hand.
 */
export async function inviteGuestToApp(guest: { id: string; name: string; email?: string | null }, athleteName: string): Promise<boolean> {
  const { code, error } = await createFanInvite(guest.id);
  if (error || !code) { showToast("Couldn't create the invite. Try again."); return false; }
  const message = fanInviteMessage(guest.name.trim().split(' ')[0], athleteName || 'our athlete', code);
  if (guest.email) emailFanInvite(guest.id);
  if (Platform.OS !== 'web') { await Share.share({ message }); return true; }
  const nav = navigator as any;
  try {
    if (nav.share) { await nav.share({ text: message }); return true; }
    await nav.clipboard.writeText(message);
    showToast(guest.email ? `Invite emailed to ${guest.email} and copied` : 'Invite copied — paste it into a text');
  } catch (e: any) {
    if (e?.name === 'AbortError') return true;
    window.prompt(guest.email ? `Invite emailed to ${guest.email}. To text it too, copy:` : 'Copy this invite and text it:', message);
  }
  return true;
}

