import { useState } from 'react';
import { View, Text, Pressable, Platform, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from './useColorScheme';

// Only import native date picker on non-web platforms
let DateTimePicker: any = null;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

interface DatePickerFieldProps {
  label: string;
  value: Date | null;
  onChange: (date: Date) => void;
  error?: string;
  highlightDanger?: boolean;
}

function formatDisplay(date: Date | null): string {
  if (!date || isNaN(date.getTime())) return 'Select date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toISODate(date: Date | null): string {
  if (!date || isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}

export default function DatePickerField({ label, value, onChange, error, highlightDanger }: DatePickerFieldProps) {
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState<Date>(value ?? new Date());
  const scheme = useColorScheme();

  const open = () => {
    setDraft(value && !isNaN(value.getTime()) ? value : new Date());
    setShow(true);
  };

  const handleNativeChange = (_event: any, selectedDate?: Date) => {
    setShow(false);
    if (selectedDate) onChange(selectedDate);
  };

  const handleWebChange = (dateStr: string) => {
    if (dateStr) {
      onChange(new Date(dateStr + 'T12:00:00'));
    }
  };

  const borderClass = error
    ? 'border-red-300'
    : highlightDanger
      ? 'border-red-400 bg-red-50'
      : 'border-parchment dark:border-rally-900';

  // Web: use native HTML date input
  if (Platform.OS === 'web') {
    return (
      <View className="mb-4">
        <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">
          {label}
        </Text>
        <View className={`bg-cream dark:bg-bark-light border rounded-xl overflow-hidden ${borderClass}`}>
          <input
            type="date"
            value={toISODate(value)}
            onChange={(e: any) => handleWebChange(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: 16,
              border: 'none',
              background: 'transparent',
              color: value ? '#1E3A5F' : '#8FA8BF',
              outline: 'none',
            }}
          />
        </View>
        {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}
      </View>
    );
  }

  // Native: use DateTimePicker
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">
        {label}
      </Text>
      <Pressable
        className={`bg-cream dark:bg-bark-light border rounded-xl px-4 py-3 flex-row items-center justify-between ${borderClass}`}
        onPress={open}
      >
        <Text
          className={`text-base ${
            value
              ? highlightDanger
                ? 'text-red-600 font-semibold'
                : 'text-bark dark:text-cream'
              : 'text-stone'
          }`}
        >
          {formatDisplay(value)}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={highlightDanger ? '#dc2626' : '#8FA8BF'} />
      </Pressable>
      {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}
      {show && DateTimePicker && Platform.OS === 'android' && (
        <DateTimePicker value={value ?? new Date()} mode="date" display="default" onChange={handleNativeChange} />
      )}
      {/* iOS: calendar in a bottom sheet. An inline spinner never closed, and two
          side-by-side fields (check-in/out) overlapped each other. */}
      {DateTimePicker && Platform.OS === 'ios' && (
        <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
          <Pressable onPress={() => setShow(false)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}>
            <Pressable onPress={() => {}} className="bg-warm-white dark:bg-bark-light rounded-t-3xl px-5 pt-4 pb-10" style={{ maxWidth: 560, width: '100%', alignSelf: 'center' }}>
              <View className="flex-row items-center justify-between mb-2">
                <Pressable onPress={() => setShow(false)} className="py-2 pr-4">
                  <Text className="text-base font-semibold text-stone">Cancel</Text>
                </Pressable>
                <Text className="text-base font-bold text-bark dark:text-cream">{label}</Text>
                <Pressable onPress={() => { onChange(draft); setShow(false); }} className="py-2 pl-4">
                  <Text className="text-base font-bold text-rally-600">Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={draft}
                mode="date"
                display="inline"
                themeVariant={scheme === 'dark' ? 'dark' : 'light'}
                onChange={(_e: any, d?: Date) => { if (d) setDraft(d); }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}
