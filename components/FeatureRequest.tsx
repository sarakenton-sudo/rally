import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { tapLight } from '@/lib/haptics';

/** "What would make RallyHUB better?" — saved to feature_events for the admin panel. */
export default function FeatureRequest() {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');

  const submit = async () => {
    if (!text.trim()) return;
    const { error } = await (supabase.from('feature_events') as any).insert({
      user_id: user?.id, event_type: 'feature_request', metadata: { message: text.trim() },
    });
    if (error) { setState('error'); return; }
    tapLight();
    setText('');
    setState('sent');
    setTimeout(() => setState('idle'), 3000);
  };

  return (
    <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-3">
      <TextInput
        className="text-sm text-bark dark:text-cream min-h-[60px]"
        placeholder="What would make RallyHUB even better?"
        placeholderTextColor="#8FA8BF"
        multiline
        value={text}
        onChangeText={(v) => { setText(v); if (state === 'error') setState('idle'); }}
        textAlignVertical="top"
        accessibilityLabel="Feature request"
      />
      <View className="flex-row items-center justify-end mt-2">
        {state === 'error' && <Text className="text-xs text-red-600 mr-auto">Couldn't send. Check your connection and try again.</Text>}
        {state === 'sent' ? (
          <View className="flex-row items-center">
            <Ionicons name="checkmark-circle" size={16} color="#6A9E8A" />
            <Text className="text-xs text-green-600 ml-1">Sent. Thank you!</Text>
          </View>
        ) : (
          <Pressable
            className={`px-4 py-2 rounded-lg ${text.trim() ? 'bg-rally-600 active:opacity-80' : 'bg-parchment'}`}
            onPress={submit}
            disabled={!text.trim()}
          >
            <Text className={`text-xs font-semibold ${text.trim() ? 'text-cream' : 'text-stone'}`}>Send</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
