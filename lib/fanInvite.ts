import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { createFanInvite, emailFanInvite, fanInviteMessage } from '@/lib/fan';
import { showToast } from '@/components/Toast';

/**
 * Invite a guest to follow the family in the RallyHUB app (fan account).
 * Copies the invite so the parent pastes it into their own Messages,
 * WhatsApp or GroupMe (RallyHUB never texts anyone), and emails it too
 * when the guest has an address. On the web, copying after a server
 * round-trip can be blocked; then the text is shown to copy by hand.
 */
export async function inviteGuestToApp(guest: { id: string; name: string; email?: string | null }, athleteName: string): Promise<boolean> {
  const { code, error } = await createFanInvite(guest.id);
  if (error || !code) { showToast("Couldn't create the invite. Try again."); return false; }
  const message = fanInviteMessage(guest.name.trim().split(' ')[0], athleteName || 'our athlete', code);
  if (guest.email) emailFanInvite(guest.id);
  const done = guest.email
    ? `Invite copied and emailed to ${guest.email}. Paste it into a text too.`
    : `Invite copied. Paste it into a text to ${guest.name.trim().split(' ')[0]}.`;
  try {
    if (Platform.OS === 'web') await navigator.clipboard.writeText(message);
    else await Clipboard.setStringAsync(message);
    showToast(done);
  } catch {
    if (Platform.OS === 'web') window.prompt('Copy this invite and send it in a text:', message);
    else showToast("Couldn't copy the invite. Try again.");
  }
  return true;
}
