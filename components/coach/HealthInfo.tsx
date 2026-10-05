import { Text, Linking } from 'react-native';
import { hasRealAllergies } from '@/lib/coach';

/**
 * Athlete health info for the coach, as one quiet FYI line:
 * "FYI · Allergies: peanuts · Medical: asthma · Emergency: Jordan 512…".
 * Payment status, not health info, carries the visual weight on lesson cards.
 */
export default function HealthInfo({ allergies, medicalNotes, ecName, ecPhone }: {
  allergies?: string | null;
  medicalNotes?: string | null;
  ecName?: string | null;
  ecPhone?: string | null;
}) {
  if (!allergies && !medicalNotes && !ecName && !ecPhone) return null;
  const allergic = hasRealAllergies(allergies);
  const parts: string[] = [];
  if (allergies) parts.push(allergic ? `Allergies: ${allergies}` : 'No known allergies');
  if (medicalNotes) parts.push(`Medical: ${medicalNotes}`);
  return (
    <Text className="text-[11px] text-stone dark:text-parchment mt-1.5 leading-4" accessibilityLabel={`Health FYI. ${parts.join('. ')}`}>
      <Text className="font-semibold">FYI · </Text>
      {parts.join(' · ')}
      {ecName || ecPhone ? (
        <>
          {parts.length ? ' · ' : ''}Emergency: {ecName ?? ''}
          {ecPhone ? (
            <Text className="text-rally-600" onPress={() => Linking.openURL(`tel:${ecPhone.replace(/[^\d+]/g, '')}`)}>
              {ecName ? ' ' : ''}{ecPhone}
            </Text>
          ) : null}
        </>
      ) : null}
    </Text>
  );
}
