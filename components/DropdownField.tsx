import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CORAL, CORAL_DARK, CORAL_TINT } from '@/lib/colors';

interface DropdownFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  error?: string;
}

/**
 * A pick-one field that opens as a list right under itself. No pop-up sheet:
 * a sheet on top of a form that's already a sheet was hard to read on iPhone.
 */
export default function DropdownField({ label, value, options, onChange, error }: DropdownFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">{label}</Text>
      <Pressable
        className={`bg-cream dark:bg-bark-light border rounded-xl px-4 py-3 flex-row items-center justify-between ${
          error ? 'border-red-300' : open ? '' : 'border-parchment dark:border-rally-900'
        }`}
        style={open ? { borderColor: CORAL } : undefined}
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || 'not set'}`}
        accessibilityState={{ expanded: open }}
      >
        <Text className={`text-base ${value ? 'text-bark dark:text-cream' : 'text-stone'}`}>{value || 'Select...'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={open ? CORAL : '#8FA8BF'} />
      </Pressable>
      {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}

      {open && (
        <View className="mt-1.5 rounded-xl overflow-hidden border bg-white dark:bg-bark-light" style={{ borderColor: CORAL + '55' }}>
          {options.map((item, i) => {
            const on = item === value;
            return (
              <Pressable
                key={item}
                onPress={() => { onChange(item); setOpen(false); }}
                className="px-4 py-3 flex-row items-center justify-between active:opacity-70"
                style={[on ? { backgroundColor: CORAL_TINT } : null, i > 0 ? { borderTopWidth: 1, borderTopColor: '#EEF2F6' } : null]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text className={`text-base ${on ? 'font-semibold' : 'text-bark dark:text-cream'}`} style={on ? { color: CORAL_DARK } : undefined}>{item}</Text>
                {on && <Ionicons name="checkmark-circle" size={20} color={CORAL} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
