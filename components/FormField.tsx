import { View, Text, TextInput, type TextInputProps } from 'react-native';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export default function FormField({ label, error, ...inputProps }: FormFieldProps) {
  return (
    <View className={label ? 'mb-4' : 'mb-0'}>
      {label ? (
        <Text className="text-sm font-medium text-bark dark:text-parchment mb-1.5">
          {label}
        </Text>
      ) : null}
      <TextInput
        className={`bg-cream dark:bg-bark-light border rounded-xl px-4 py-3 text-base text-bark dark:text-cream ${
          error ? 'border-red-300' : 'border-parchment dark:border-rally-900'
        }`}
        placeholderTextColor="#9E8E7E"
        {...inputProps}
      />
      {error && (
        <Text className="text-xs text-red-500 mt-1">{error}</Text>
      )}
    </View>
  );
}
