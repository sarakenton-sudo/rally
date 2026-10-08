import { track } from '@/lib/track-event';
import { View, Text, Pressable, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { showToast } from '@/components/Toast';
import { tapLight } from '@/lib/haptics';
import { coachReferralMessage } from '@/lib/coachReferral';
import { CORAL, CORAL_TINT } from '@/lib/colors';

/**
 * "Know a coach who'd love RallyHUB?" — coach-to-coach sharing, linking to the
 * coaches landing page. Shown at the bottom of each coach tab.
 */
export default function ShareWithCoaches({ fromName }: { fromName?: string | null }) {
  const share = async () => {
    tapLight();
    track('coach_referral_shared');
    const message = coachReferralMessage(fromName);
    if (Platform.OS !== 'web') { await Share.share({ message }); return; }
    try {
      await navigator.clipboard.writeText(message);
      showToast('Copied. Paste it into a text to a coach.');
    } catch {
      window.prompt('Copy this and text it to a coach:', message);
    }
  };
  return (
    <Pressable onPress={share} className="flex-row items-center rounded-2xl p-4 mt-6 mb-2 active:opacity-80" style={{ backgroundColor: CORAL_TINT, borderWidth: 1, borderColor: CORAL + '55' }} accessibilityLabel="Share RallyHUB with another coach">
      <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#fff' }}>
        <Ionicons name="megaphone" size={18} color={CORAL} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-bark">Know a coach who'd love RallyHUB?</Text>
        <Text className="text-xs text-stone mt-0.5">Share it. It's free for coaches.</Text>
      </View>
      <View className="flex-row items-center rounded-full px-3 py-1.5" style={{ backgroundColor: CORAL }}>
        <Ionicons name={Platform.OS === 'web' ? 'copy-outline' : 'share-outline'} size={13} color="#fff" />
        <Text className="text-xs font-bold text-white ml-1">{Platform.OS === 'web' ? 'Copy' : 'Share'}</Text>
      </View>
    </Pressable>
  );
}
