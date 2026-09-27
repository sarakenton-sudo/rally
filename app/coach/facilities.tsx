import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from '@/components/SafeAreaView';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import FormField from '@/components/FormField';
import { useCoachStore } from '@/stores/useCoachStore';
import { fetchFacilities, createFacility, deleteFacility, updateFacility, isSupabaseConfigured } from '@/lib/coach';
import { useIconColors } from '@/lib/colors';
import { notifySuccess, notifyError } from '@/lib/haptics';
import type { Facility } from '@/types/database';

export default function CoachFacilitiesScreen() {
  const ic = useIconColors();
  const coachProfile = useCoachStore((s) => s.coachProfile);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // New-facility form
  const [label, setLabel] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [contact, setContact] = useState('');

  const showAlert = (t: string, m: string) => {
    if (Platform.OS === 'web') window.alert(`${t}: ${m}`);
    else Alert.alert(t, m);
  };

  const load = useCallback(async () => {
    if (!coachProfile || !isSupabaseConfigured) { setLoading(false); return; }
    const { data } = await fetchFacilities(coachProfile.id);
    setFacilities(data);
    setLoading(false);
  }, [coachProfile]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!coachProfile) return;
    if (!label.trim()) { showAlert('Missing field', 'Give the facility a name.'); notifyError(); return; }
    setAdding(true);
    try {
      const { data, error } = await createFacility(
        coachProfile.id,
        { label: label.trim(), address: address.trim() || null, city: city.trim() || null, notes: null, contact: contact.trim() || null },
        facilities.length,
      );
      if (error) { showAlert('Could not add', error.message); return; }
      if (data) {
        setFacilities((f) => [...f, data]);
        setLabel(''); setAddress(''); setCity('');
        notifySuccess();
      }
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (facility: Facility) => {
    const hide = async () => {
      const { error } = await updateFacility(facility.id, { is_active: false });
      if (error) { showAlert('Could not hide', error.message); return; }
      setFacilities((f) => f.filter((x) => x.id !== facility.id));
      notifySuccess();
    };
    const doDelete = async () => {
      const { error, inUse } = await deleteFacility(facility.id);
      if (inUse) {
        // Blocks still point here — hide it instead so they keep their location.
        const msg = `"${facility.label}" is used by availability blocks, so it can't be deleted. Hide it from your list instead? Existing blocks keep it.`;
        if (Platform.OS === 'web') { if (window.confirm(msg)) hide(); }
        else Alert.alert('Facility in use', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Hide', onPress: hide }]);
        return;
      }
      if (error) { showAlert('Could not delete', error.message); return; }
      setFacilities((f) => f.filter((x) => x.id !== facility.id));
      notifySuccess();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${facility.label}"?`)) doDelete();
    } else {
      Alert.alert('Delete facility', `Delete "${facility.label}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-cream dark:bg-bark" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-parchment dark:border-bark-light bg-warm-white dark:bg-bark">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={ic.muted} />
        </Pressable>
        <Text className="text-lg font-bold text-bark dark:text-cream">Facilities</Text>
        <View className="w-6" />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text className="text-sm text-stone dark:text-parchment mb-4">
            Add every gym you coach at. You'll set availability and take bookings per facility, and clients can pick where to train.
          </Text>

          {loading ? (
            <ActivityIndicator color="#3B82B0" className="mt-6" />
          ) : (
            <>
              {facilities.map((f) => (
                <View
                  key={f.id}
                  className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mb-2 flex-row items-center"
                  style={{ shadowColor: '#1E3A5F', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}
                >
                  <View className="w-9 h-9 rounded-full items-center justify-center mr-3" style={{ backgroundColor: '#0d948815' }}>
                    <Ionicons name="business" size={17} color="#0d9488" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-bark dark:text-cream">{f.label}</Text>
                    {(f.address || f.city) && (
                      <Text className="text-xs text-stone dark:text-parchment mt-0.5">
                        {[f.address, f.city].filter(Boolean).join(', ')}
                      </Text>
                    )}
                  </View>
                  <Pressable onPress={() => handleDelete(f)} className="p-2 active:opacity-60">
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  </Pressable>
                </View>
              ))}

              {facilities.length === 0 && (
                <View className="items-center py-6">
                  <Ionicons name="business-outline" size={28} color={ic.placeholder} />
                  <Text className="text-sm text-stone dark:text-parchment mt-2">No facilities yet</Text>
                </View>
              )}

              {/* Add new */}
              <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900 mt-4">
                <Text className="text-sm font-bold text-bark dark:text-cream mb-3">Add a facility</Text>
                <FormField label="Name" value={label} onChangeText={setLabel} placeholder="e.g. Westside Volleyball Club" />
                <FormField label="Address" value={address} onChangeText={setAddress} placeholder="e.g. 1200 Court St" />
                <FormField label="City" value={city} onChangeText={setCity} placeholder="e.g. Austin, TX" />
                <FormField label="Booking contact (optional)" value={contact} onChangeText={setContact} placeholder="e.g. Jen, front desk · 512-555-0100" />
                <Pressable
                  onPress={handleAdd}
                  disabled={adding}
                  className={`rounded-xl py-3 items-center mt-1 ${adding ? 'bg-parchment' : 'bg-rally-600 active:opacity-80'}`}
                >
                  <Text className="text-sm font-semibold text-cream">{adding ? 'Adding...' : 'Add facility'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
