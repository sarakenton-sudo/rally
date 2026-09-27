import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchAcceptance, acceptanceOutdated, type PolicyAcceptance } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';

/** A signed record: exactly what was agreed, who signed, and when. */
export default function SignedDocumentScreen() {
  const ic = useIconColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<PolicyAcceptance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchAcceptance(id).then((d) => { setDoc(d); setLoading(false); });
  }, [id]);

  const athlete = doc?.athletes ? `${doc.athletes.first_name}${doc.athletes.last_name ? ' ' + doc.athletes.last_name : ''}` : 'Athlete';
  const signedAt = doc ? new Date(doc.accepted_at) : null;

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="close" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Signed Documents</Text>
        <View className="w-6" />
      </View>

      {loading ? (
        <ActivityIndicator color="#3B82B0" className="mt-8" />
      ) : !doc ? (
        <Text className="text-sm text-stone text-center mt-8">Document not found.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {/* Signature record */}
          <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-4">
            <View className="flex-row items-center mb-2">
              <Ionicons name="create" size={18} color="#16a34a" />
              <Text className="text-base font-bold text-bark dark:text-cream ml-2">Signed</Text>
            </View>
            {[
              ['Coach', doc.coaches?.display_name ?? 'Coach'],
              ['Athlete', athlete],
              ['Signed by', doc.signer_name],
              ['Date', signedAt ? `${signedAt.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} at ${signedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''],
            ].map(([k, v]) => (
              <View key={k} className="flex-row py-1">
                <Text className="text-xs text-stone w-20">{k}</Text>
                <Text className="text-xs font-semibold text-bark dark:text-cream flex-1">{v}</Text>
              </View>
            ))}
            <Text className="text-lg text-bark dark:text-cream mt-2" style={{ fontStyle: 'italic' }}>{doc.signer_name}</Text>
            {acceptanceOutdated(doc) && (
              <View className="flex-row items-start rounded-lg px-2.5 py-2 mt-3" style={{ backgroundColor: '#d977061a' }}>
                <Ionicons name="refresh" size={14} color="#b45309" style={{ marginTop: 1 }} />
                <Text className="text-xs ml-1.5 flex-1" style={{ color: '#b45309' }}>
                  The coach has updated their terms since this was signed. The new version will be signed at the next booking.
                </Text>
              </View>
            )}
          </View>

          {[
            { title: 'Lesson Terms', text: doc.terms_text },
            { title: 'Participant Release', text: doc.release_text },
            { title: 'RallyHUB Platform Terms', text: doc.platform_text },
          ].map((d) => (
            <View key={d.title} className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-3">
              <Text className="text-xs font-semibold uppercase tracking-wider text-stone mb-2">{d.title}</Text>
              <Text className="text-xs leading-5 text-bark dark:text-cream" selectable>{d.text}</Text>
            </View>
          ))}
          <Text className="text-[11px] text-stone text-center mt-2">This is the exact text shown when it was signed.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
