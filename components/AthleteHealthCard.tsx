import { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert, Platform } from 'react-native';
import FormField from '@/components/FormField';
import HealthInfo from '@/components/coach/HealthInfo';
import { fetchAthleteHealth, saveAthleteHealth, type AthleteHealth } from '@/lib/coach';
import { notifySuccess, notifyError } from '@/lib/haptics';

const EMPTY: AthleteHealth = { allergies: '', medical_notes: '', emergency_contact_name: '', emergency_contact_phone: '' };

/** Parent-editable allergies / medical notes / emergency contact (shared with booked coaches). */
export default function AthleteHealthCard({ athleteId }: { athleteId: string }) {
  const [saved, setSaved] = useState<AthleteHealth | null>(null);
  const [draft, setDraft] = useState<AthleteHealth>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAthleteHealth(athleteId).then((h) => { setSaved(h); setDraft({ ...EMPTY, ...h }); });
  }, [athleteId]);

  const save = async () => {
    setBusy(true);
    const { error } = await saveAthleteHealth(athleteId, draft);
    setBusy(false);
    if (error) {
      notifyError();
      Platform.OS === 'web' ? window.alert(error.message) : Alert.alert("Couldn't save", error.message);
      return;
    }
    notifySuccess();
    setSaved(draft);
    setEditing(false);
  };

  const set = (k: keyof AthleteHealth) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const empty = !saved?.allergies && !saved?.emergency_contact_phone;

  return (
    <View className="bg-warm-white dark:bg-bark-light rounded-xl p-4 border border-parchment dark:border-rally-900">
      {editing ? (
        <>
          <FormField label="Allergies" value={draft.allergies ?? ''} onChangeText={set('allergies')} placeholder='e.g. peanuts — or "None"' />
          <FormField label="Medical conditions or notes" value={draft.medical_notes ?? ''} onChangeText={set('medical_notes')} placeholder="Optional" multiline />
          <FormField label="Emergency contact" value={draft.emergency_contact_name ?? ''} onChangeText={set('emergency_contact_name')} placeholder="Name" />
          <FormField label="Their phone" value={draft.emergency_contact_phone ?? ''} onChangeText={set('emergency_contact_phone')} placeholder="(512) 555-0100" keyboardType="phone-pad" />
          <View className="flex-row">
            <Pressable disabled={busy} onPress={save} className="bg-rally-600 rounded-lg px-4 py-2 mr-2 active:opacity-80">
              <Text className="text-xs font-bold text-cream">{busy ? 'Saving…' : 'Save'}</Text>
            </Pressable>
            <Pressable onPress={() => { setDraft({ ...EMPTY, ...saved }); setEditing(false); }} className="px-3 py-2">
              <Text className="text-xs font-semibold text-stone">Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {empty ? (
            <Text className="text-xs text-stone dark:text-parchment">No health info yet. Coaches need allergies and an emergency contact before a lesson.</Text>
          ) : (
            <HealthInfo
              allergies={saved?.allergies}
              medicalNotes={saved?.medical_notes}
              ecName={saved?.emergency_contact_name}
              ecPhone={saved?.emergency_contact_phone}
            />
          )}
          <Pressable onPress={() => setEditing(true)} className="mt-2 self-start">
            <Text className="text-xs font-semibold text-rally-600">{empty ? 'Add health info' : 'Edit'}</Text>
          </Pressable>
          <Text className="text-[11px] text-stone mt-2">Shared only with coaches you book lessons with.</Text>
        </>
      )}
    </View>
  );
}
