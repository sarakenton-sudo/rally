import { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  if (!date) return 'Select date';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toISODate(date: Date | null): string {
  if (!date) return '';
  return date.toISOString().split('T')[0];
}

export default function DatePickerField({ label, value, onChange, error, highlightDanger }: DatePickerFieldProps) {
  const [show, setShow] = useState(false);

  const handleNativeChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShow(false);
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
        onPress={() => setShow(true)}
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
      {show && DateTimePicker && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleNativeChange}
        />
      )}
    </View>
  );
}
