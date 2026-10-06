import { useState } from 'react';
import { View, Text, TextInput, Pressable, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { showToast } from '@/components/Toast';
import { APP_STORE_URL } from '@/lib/fan';
import { Ionicons } from '@expo/vector-icons';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { tapLight } from '@/lib/haptics';

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default function ReferFriend() {
  const { user } = useAuth();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // RallyHUB never texts anyone: copy the invite and send it from your own
  // Messages, WhatsApp or GroupMe. Email addresses get an invite email.
  async function copyInvite() {
    tapLight();
    const msg = `I've been using RallyHUB for our volleyball season: tournaments, hotels, team codes and stream links all in one place. It's free: ${APP_STORE_URL}`;
    try {
      if (Platform.OS === 'web') await navigator.clipboard.writeText(msg);
      else await Clipboard.setStringAsync(msg);
      showToast('Invite copied. Paste it into a text.');
    } catch {
      if (Platform.OS === 'web') window.prompt('Copy this invite and send it in a text:', msg);
    }
  }

  async function handleSend() {
    const email = value.trim();
    if (!email) return;
    if (!isEmail(email)) {
      showToast('Enter an email address, or tap Copy invite to text it.');
      return;
    }

    tapLight();
    setSending(true);

    try {
      if (isSupabaseConfigured && user) {
        const { data: referral } = await supabase.from('referrals').insert({
          referrer_user_id: user.id,
          referred_email: email,
        }).select().single();

        if (referral) {
          supabase.functions.invoke('send-referral', {
            body: { referral_id: referral.id, referrer_user_id: user.id, referred_email: email, invite_type: 'referral' },
          }).catch(() => {
            // Silent fail — referral is saved, invite delivery is best-effort
          });
        }
      }
    } catch {
      // Don't block the UX on referral tracking
    } finally {
      setSent(true);
      setValue('');
      setTimeout(() => setSent(false), 4000);
      setSending(false);
    }
  }

  return (
    <View className="px-4 py-5">
      <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900"
        style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
      >
        <View className="flex-row items-center mb-3">
          <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: 'rgba(219,39,119,0.12)' }}>
            <Ionicons name="heart" size={18} color="#DB2777" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-bark dark:text-cream">Know someone who'd love RallyHUB?</Text>
            <Text className="text-xs text-stone dark:text-parchment mt-0.5">Copy an invite to text them, or email it</Text>
          </View>
        </View>

        <Pressable onPress={copyInvite} className="flex-row items-center justify-center rounded-xl py-2.5 mb-2 active:opacity-80" style={{ backgroundColor: '#DB2777' }} accessibilityLabel="Copy invite">
          <Ionicons name="copy-outline" size={16} color="#FEFEFE" />
          <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-Bold', color: '#FEFEFE', marginLeft: 6 }}>Copy invite to text</Text>
        </Pressable>

        {sent ? (
          <View className="flex-row items-center justify-center py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(106,158,138,0.12)' }}>
            <Ionicons name="checkmark-circle" size={18} color="#6A9E8A" />
            <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#6A9E8A', marginLeft: 6 }}>
              Invite emailed! Thanks for spreading the word.
            </Text>
          </View>
        ) : (
          <View className="flex-row items-center gap-2">
            <View className="flex-1 bg-cream dark:bg-bark rounded-xl border border-parchment dark:border-rally-900 px-3 py-2">
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder="Their email (optional)"
                placeholderTextColor="#8FA8BF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                style={{ fontSize: 13, fontFamily: 'NunitoSans-Regular', color: '#1E3A5F' }}
              />
            </View>
            <Pressable
              onPress={handleSend}
              disabled={sending || !value.trim()}
              className="active:opacity-70"
              style={{
                backgroundColor: sending || !value.trim() ? '#D8E2EC' : '#DB2777',
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 14,
              }}
            >
              <Ionicons
                name={sending ? 'hourglass' : 'send'}
                size={16}
                color={sending || !value.trim() ? '#8FA8BF' : '#FEFEFE'}
              />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
