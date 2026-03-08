import { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DropdownFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  error?: string;
}

export default function DropdownField({ label, value, options, onChange, error }: DropdownFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">
        {label}
      </Text>
      <Pressable
        className={`bg-cream dark:bg-bark-light border rounded-xl px-4 py-3 flex-row items-center justify-between ${
          error ? 'border-red-300' : 'border-parchment dark:border-rally-900'
        }`}
        onPress={() => setVisible(true)}
      >
        <Text className={`text-base ${value ? 'text-bark dark:text-cream' : 'text-stone'}`}>
          {value || 'Select...'}
        </Text>
        <Ionicons name="chevron-down" size={20} color="#9E8E7E" />
      </Pressable>
      {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}

      <Modal visible={visible} transparent animationType="fade">
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={() => setVisible(false)}
        >
          <View className="bg-warm-white dark:bg-bark-light rounded-t-2xl max-h-[50%]">
            <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
              <Text className="text-lg font-bold text-bark dark:text-cream">{label}</Text>
              <Pressable onPress={() => setVisible(false)}>
                <Ionicons name="close-circle" size={24} color="#9E8E7E" />
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  className={`px-5 py-3.5 border-b border-parchment dark:border-rally-900 ${
                    item === value ? 'bg-rally-50 dark:bg-rally-900/20' : ''
                  }`}
                  onPress={() => {
                    onChange(item);
                    setVisible(false);
                  }}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className={`text-base ${
                      item === value ? 'text-rally-600 font-semibold' : 'text-bark dark:text-parchment'
                    }`}>
                      {item}
                    </Text>
                    {item === value && <Ionicons name="checkmark" size={20} color="#C4714A" />}
                  </View>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
