import { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

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

export default function DatePickerField({ label, value, onChange, error, highlightDanger }: DatePickerFieldProps) {
  const [show, setShow] = useState(false);

  const handleChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShow(false);
    if (selectedDate) onChange(selectedDate);
  };

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">
        {label}
      </Text>
      <Pressable
        className={`bg-cream dark:bg-bark-light border rounded-xl px-4 py-3 flex-row items-center justify-between ${
          error
            ? 'border-red-300'
            : highlightDanger
              ? 'border-red-400 bg-red-50'
              : 'border-parchment dark:border-rally-900'
        }`}
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
      {show && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
        />
      )}
    </View>
  );
}
