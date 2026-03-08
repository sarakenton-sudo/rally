import { View, Text, TextInput, type TextInputProps } from 'react-native';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export default function FormField({ label, error, ...inputProps }: FormFieldProps) {
  return (
    <View className={label ? 'mb-4' : 'mb-0'}>
      {label ? (
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          {label}
        </Text>
      ) : null}
      <TextInput
        className={`bg-gray-50 dark:bg-gray-800 border rounded-xl px-4 py-3 text-base text-gray-900 dark:text-white ${
          error ? 'border-red-300' : 'border-gray-200 dark:border-gray-700'
        }`}
        placeholderTextColor="#9ca3af"
        {...inputProps}
      />
      {error && (
        <Text className="text-xs text-red-500 mt-1">{error}</Text>
      )}
    </View>
  );
}
