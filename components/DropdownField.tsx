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
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}
      </Text>
      <Pressable
        className={`bg-gray-50 dark:bg-gray-800 border rounded-xl px-4 py-3 flex-row items-center justify-between ${
          error ? 'border-red-300' : 'border-gray-200 dark:border-gray-700'
        }`}
        onPress={() => setVisible(true)}
      >
        <Text className={`text-base ${value ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
          {value || 'Select...'}
        </Text>
        <Ionicons name="chevron-down" size={20} color="#9ca3af" />
      </Pressable>
      {error && <Text className="text-xs text-red-500 mt-1">{error}</Text>}

      <Modal visible={visible} transparent animationType="fade">
        <Pressable
          className="flex-1 bg-black/40 justify-end"
          onPress={() => setVisible(false)}
        >
          <View className="bg-white dark:bg-gray-800 rounded-t-2xl max-h-[50%]">
            <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
              <Text className="text-lg font-bold text-gray-900 dark:text-white">{label}</Text>
              <Pressable onPress={() => setVisible(false)}>
                <Ionicons name="close-circle" size={24} color="#9ca3af" />
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  className={`px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 ${
                    item === value ? 'bg-rally-50 dark:bg-rally-900/20' : ''
                  }`}
                  onPress={() => {
                    onChange(item);
                    setVisible(false);
                  }}
                >
                  <View className="flex-row items-center justify-between">
                    <Text className={`text-base ${
                      item === value ? 'text-rally-600 font-semibold' : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {item}
                    </Text>
                    {item === value && <Ionicons name="checkmark" size={20} color="#2563eb" />}
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
