import { View, Text, Image } from 'react-native';
import { initials, avatarColor } from '@/lib/coach';

/**
 * Round photo, or initials on a color when there's no photo. Sized with
 * explicit style (not className) so it always renders on iOS.
 * Used for coaches, parents, and athletes.
 */
export default function Avatar({ uri, name, size = 40, colorKey, borderColor }: {
  uri?: string | null;
  name: string;
  size?: number;
  colorKey?: string;        // stable color for the initials fallback (e.g. an id)
  borderColor?: string;
}) {
  const ring = borderColor ? { borderWidth: 2, borderColor } : null;
  if (uri) {
    return <Image source={{ uri }} style={[{ width: size, height: size, borderRadius: size / 2 }, ring]} resizeMode="cover" />;
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(colorKey ?? name), alignItems: 'center', justifyContent: 'center' }, ring]}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: Math.round(size * 0.38) }}>{initials(name)}</Text>
    </View>
  );
}
