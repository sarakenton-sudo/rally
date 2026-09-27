import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { acceptanceOutdated, type PolicyAcceptance } from '@/lib/coach';

/** Rows of signed terms/releases; tap to view the exact signed text. */
export default function SignedDocumentsList({ rows, label, emptyText }: {
  rows: PolicyAcceptance[];
  label: (r: PolicyAcceptance) => string;   // "Coach Maya" (parent view) or "Drue" (coach view)
  emptyText: string;
}) {
  if (!rows.length) {
    return <Text className="text-xs text-stone dark:text-parchment">{emptyText}</Text>;
  }
  return (
    <View>
      {rows.map((r) => {
        const outdated = acceptanceOutdated(r);
        return (
          <Pressable
            key={r.id}
            onPress={() => router.push({ pathname: '/documents/[id]', params: { id: r.id } })}
            className="flex-row items-center py-2.5 border-b border-parchment dark:border-rally-900 active:opacity-70"
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: outdated ? '#d977061a' : '#16a34a1a' }}>
              <Ionicons name={outdated ? 'refresh' : 'document-text'} size={15} color={outdated ? '#b45309' : '#16a34a'} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-bark dark:text-cream">{label(r)}</Text>
              <Text className="text-xs text-stone dark:text-parchment">
                Terms + release · signed {new Date(r.accepted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} by {r.signer_name}
              </Text>
              {outdated && <Text className="text-[11px] font-semibold" style={{ color: '#b45309' }}>Updated since — re-signs at next booking</Text>}
            </View>
            <Ionicons name="chevron-forward" size={16} color="#8FA8BF" />
          </Pressable>
        );
      })}
    </View>
  );
}
