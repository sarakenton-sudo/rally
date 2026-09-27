import { View, Text, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hasRealAllergies } from '@/lib/coach';

/** Athlete health info for the coach: allergies (red if any), medical notes, emergency contact. */
export default function HealthInfo({ allergies, medicalNotes, ecName, ecPhone }: {
  allergies?: string | null;
  medicalNotes?: string | null;
  ecName?: string | null;
  ecPhone?: string | null;
}) {
  if (!allergies && !medicalNotes && !ecName && !ecPhone) return null;
  const allergic = hasRealAllergies(allergies);
  return (
    <View className="mt-2">
      {allergies ? (
        <View
          className="flex-row items-start rounded-lg px-2.5 py-1.5 mb-1"
          style={{ backgroundColor: allergic ? '#dc26261a' : '#16a34a14' }}
        >
          <Ionicons name={allergic ? 'warning' : 'checkmark-circle'} size={13} color={allergic ? '#dc2626' : '#16a34a'} style={{ marginTop: 1 }} />
          <Text className="text-xs font-semibold ml-1.5 flex-1" style={{ color: allergic ? '#dc2626' : '#16a34a' }}>
            {allergic ? `Allergies: ${allergies}` : 'No known allergies'}
          </Text>
        </View>
      ) : null}
      {medicalNotes ? (
        <Text className="text-xs text-bark dark:text-cream mb-0.5">Medical: {medicalNotes}</Text>
      ) : null}
      {ecName || ecPhone ? (
        <Text className="text-xs text-stone dark:text-parchment">
          Emergency: {ecName ?? ''}{ecPhone ? (
            <Text className="text-rally-600 font-semibold" onPress={() => Linking.openURL(`tel:${ecPhone.replace(/[^\d+]/g, '')}`)}>
              {ecName ? ' · ' : ''}{ecPhone}
            </Text>
          ) : null}
        </Text>
      ) : null}
    </View>
  );
}
