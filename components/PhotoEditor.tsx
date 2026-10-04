import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '@/components/Avatar';
import { pickAndUploadPhoto } from '@/lib/coach';
import { useAuth } from '@/providers/AuthProvider';
import { notifySuccess, notifyError } from '@/lib/haptics';

/**
 * Tap-to-change profile photo (parent, athlete, coach). Uploads, then calls
 * onSaved(url) so the caller persists it to the right record.
 */
export default function PhotoEditor({ uri, name, size = 72, colorKey, onSaved, label = 'Change photo' }: {
  uri?: string | null;
  name: string;
  size?: number;
  colorKey?: string;
  onSaved: (url: string) => Promise<{ error: Error | null }>;
  label?: string;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(uri ?? null);

  const pick = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const url = await pickAndUploadPhoto(user.id);
      if (!url) return; // cancelled
      const { error } = await onSaved(url);
      if (error) throw error;
      setCurrent(url);
      notifySuccess();
    } catch (e: any) {
      notifyError();
      const m = e?.message ?? 'Please try again.';
      Platform.OS === 'web' ? window.alert(`Couldn't update photo: ${m}`) : Alert.alert("Couldn't update photo", m);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable onPress={pick} disabled={busy} className="items-center active:opacity-80">
      <View>
        <Avatar uri={current} name={name} size={size} colorKey={colorKey} />
        <View
          style={{ position: 'absolute', right: -2, bottom: -2, width: size * 0.34, height: size * 0.34, borderRadius: size, backgroundColor: '#3B82B0', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FEFEFE' }}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={Math.round(size * 0.18)} color="#fff" />}
        </View>
      </View>
      <Text className="text-xs font-semibold text-rally-600 mt-1.5">{busy ? 'Uploading…' : current ? label : 'Add photo'}</Text>
    </Pressable>
  );
}
