import { View, Text, TextInput, type TextInputProps } from 'react-native';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

export default function FormField({ label, error, darkBg, ...inputProps }: FormFieldProps & { darkBg?: boolean }) {
  return (
    <View className={label ? 'mb-4' : 'mb-0'}>
      {label ? (
        <Text className={`text-sm font-medium mb-1.5 ${darkBg ? 'text-parchment' : 'text-bark dark:text-parchment'}`}>
          {label}
        </Text>
      ) : null}
      <TextInput
        className={`border rounded-xl px-4 py-3 text-base ${
          darkBg
            ? `bg-bark-light text-cream ${error ? 'border-red-400' : 'border-rally-900'}`
            : `bg-cream dark:bg-bark-light text-bark dark:text-cream ${error ? 'border-red-300' : 'border-parchment dark:border-rally-900'}`
        }`}
        placeholderTextColor={darkBg ? 'rgba(255,255,255,0.35)' : '#8FA8BF'}
        {...inputProps}
      />
      {error && (
        <Text className="text-xs text-red-500 mt-1">{error}</Text>
      )}
    </View>
  );
}
