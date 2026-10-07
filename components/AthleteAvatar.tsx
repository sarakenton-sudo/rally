import { View, Text } from 'react-native';
import Avatar from '@/components/Avatar';
import type { Athlete } from '@/types/database';

const AVATAR_COLORS = [
  '#3B82B0', '#7c3aed', '#6A9E8A', '#d97706', '#dc2626',
  '#0d9488', '#be185d', '#4f46e5', '#ca8a04', '#0891b2',
];

/** The athlete's photo, or their initial on their color. Used on tournament and game cards. */
export default function AthleteAvatar({ athlete, size = 36 }: { athlete: Pick<Athlete, 'first_name' | 'photo_url' | 'avatar_color'>; size?: number }) {
  if (athlete.photo_url) return <Avatar uri={athlete.photo_url} name={athlete.first_name} size={size} />;
  return (
    <View
      className="rounded-full items-center justify-center"
      style={{ width: size, height: size, backgroundColor: athlete.avatar_color || AVATAR_COLORS[athlete.first_name.charCodeAt(0) % AVATAR_COLORS.length] }}
    >
      <Text style={{ fontSize: Math.round(size * 0.42), fontWeight: '700', color: '#FEFEFE' }}>{athlete.first_name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}
