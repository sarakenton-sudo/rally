import { useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { tapLight } from '@/lib/haptics';

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isPhone(v: string) {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

export default function ReferFriend() {
  const { user } = useAuth();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    const trimmed = value.trim();
    if (!trimmed) return;

    const email = isEmail(trimmed) ? trimmed : null;
    const phone = !email && isPhone(trimmed) ? trimmed.replace(/\D/g, '') : null;

    if (!email && !phone) {
      const msg = 'Please enter a valid email address or phone number.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Invalid input', msg);
      return;
    }

    tapLight();
    setSending(true);

    try {
      if (isSupabaseConfigured && user) {
        const { data: referral } = await supabase.from('referrals').insert({
          referrer_user_id: user.id,
          referred_email: email,
          referred_phone: phone,
        }).select().single();

        // Send the invite via edge function (email or SMS)
        if (referral) {
          supabase.functions.invoke('send-referral', {
            body: {
              referral_id: referral.id,
              referrer_user_id: user.id,
              referred_email: email,
              referred_phone: phone,
              invite_type: 'referral',
            },
          }).catch(() => {
            // Silent fail — referral is saved, invite delivery is best-effort
          });
        }
      }
      setSent(true);
      setValue('');
      setTimeout(() => setSent(false), 4000);
    } catch {
      // Silent fail — don't block UX for referral tracking
      setSent(true);
      setValue('');
      setTimeout(() => setSent(false), 4000);
    } finally {
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
            <Text className="text-sm font-bold text-bark dark:text-cream">Know someone who'd love RALLY?</Text>
            <Text className="text-xs text-stone dark:text-parchment mt-0.5">Send them an invite — email or phone</Text>
          </View>
        </View>

        {sent ? (
          <View className="flex-row items-center justify-center py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(106,158,138,0.12)' }}>
            <Ionicons name="checkmark-circle" size={18} color="#6A9E8A" />
            <Text style={{ fontSize: 13, fontFamily: 'NunitoSans-SemiBold', color: '#6A9E8A', marginLeft: 6 }}>
              Invite sent! Thanks for spreading the word.
            </Text>
          </View>
        ) : (
          <View className="flex-row items-center gap-2">
            <View className="flex-1 bg-cream dark:bg-bark rounded-xl border border-parchment dark:border-rally-900 px-3 py-2">
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder="Email or phone number"
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
