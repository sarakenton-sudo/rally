import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * App-wide toast. Mount <ToastHost /> once (root layout); call showToast()
 * from anywhere: showToast('Hotel saved', { actionLabel: 'View', onAction }).
 */
type ToastSpec = { message: string; actionLabel?: string; onAction?: () => void; durationMs?: number };
let listener: ((t: ToastSpec) => void) | null = null;

export function showToast(message: string, opts: Omit<ToastSpec, 'message'> = {}) {
  listener?.({ message, ...opts });
}

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listener = (t) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(t);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, t.durationMs ?? (t.actionLabel ? 4500 : 2200));
    };
    return () => { listener = null; };
  }, []);

  const hide = () => {
    Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setToast(null));
  };

  if (!toast) return null;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 90, opacity, alignItems: 'center', zIndex: 9999 }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E3A5F', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, maxWidth: 520, width: '100%', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}
      >
        <Text style={{ color: '#FEFEFE', fontSize: 14, fontWeight: '600', flex: 1 }}>{toast.message}</Text>
        {toast.actionLabel ? (
          <Pressable onPress={() => { hide(); toast.onAction?.(); }} hitSlop={8} accessibilityRole="button">
            <Text style={{ color: '#7DBDD9', fontSize: 14, fontWeight: '800', marginLeft: 12 }}>{toast.actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}
