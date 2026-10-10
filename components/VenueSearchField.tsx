import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { supabase } from '@/lib/supabase';
import { CORAL, CORAL_TINT } from '@/lib/colors';

type Place = { name: string; address: string };

/**
 * Venue name with suggestions (Google Places via places-search). Picking one
 * fills the name and address; the address field stays editable to confirm.
 * Without a Places key it's just a normal text field.
 */
export default function VenueSearchField({ name, onChangeName, address, onChangeAddress, nameLabel = 'Venue Name', addressLabel = 'Venue Address', placeholder = 'Start typing, e.g. Austin Sports Center' }: {
  name: string; onChangeName: (v: string) => void;
  address: string; onChangeAddress: (v: string) => void;
  nameLabel?: string; addressLabel?: string; placeholder?: string;
}) {
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current || name.trim().length < 3) { setResults([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase.functions.invoke('places-search', { body: { q: name } });
      setLoading(false);
      const list = ((data as any)?.results ?? []) as Place[];
      setResults(list);
      setOpen(list.length > 0);
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [name]);

  const pick = (p: Place) => {
    typed.current = false;
    onChangeName(p.name);
    onChangeAddress(p.address);
    setOpen(false);
    setPicked(true);
  };

  return (
    <View>
      <FormField
        label={nameLabel}
        value={name}
        onChangeText={(v) => { typed.current = true; setPicked(false); onChangeName(v); }}
        placeholder={placeholder}
        autoCorrect={false}
      />
      {(open || loading) && (
        <View className="-mt-3 mb-4 rounded-xl overflow-hidden border bg-white dark:bg-bark-light" style={{ borderColor: CORAL + '55' }}>
          {loading && !results.length ? <ActivityIndicator color={CORAL} className="my-3" /> : results.map((p, i) => (
            <Pressable key={`${p.name}-${i}`} onPress={() => pick(p)} className="flex-row items-start px-4 py-3 active:opacity-70" style={i ? { borderTopWidth: 1, borderTopColor: '#EEF2F6' } : undefined} accessibilityLabel={`${p.name}, ${p.address}`}>
              <Ionicons name="location" size={16} color={CORAL} style={{ marginTop: 2 }} />
              <View className="flex-1 ml-2">
                <Text className="text-sm font-semibold text-bark dark:text-cream">{p.name}</Text>
                <Text className="text-xs text-stone dark:text-parchment">{p.address}</Text>
              </View>
            </Pressable>
          ))}
          <Pressable onPress={() => setOpen(false)} className="px-4 py-2" style={{ borderTopWidth: 1, borderTopColor: '#EEF2F6' }}>
            <Text className="text-xs text-stone">Not listed? Keep typing, or enter the address below.</Text>
          </Pressable>
        </View>
      )}
      <FormField label={addressLabel} value={address} onChangeText={(v) => { onChangeAddress(v); setPicked(false); }} placeholder="Full street address" />
      {picked && address ? (
        <View className="-mt-3 mb-4 flex-row items-center rounded-lg px-3 py-2" style={{ backgroundColor: CORAL_TINT }}>
          <Ionicons name="checkmark-circle" size={14} color={CORAL} />
          <Text className="text-xs text-bark ml-1.5 flex-1">Check the address is right, then save.</Text>
        </View>
      ) : null}
    </View>
  );
}
