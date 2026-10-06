import { useRef, useState } from 'react';
import { View, ScrollView, Pressable, Text, ActivityIndicator, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tapLight } from '@/lib/haptics';

const ACTION_W = 88;

/**
 * Swipe a row left to reveal a red Delete button; deleting takes that second
 * tap. Built on a horizontal ScrollView that snaps open or shut, so it works
 * on iPhone and the web without a gesture library.
 */
export default function SwipeToDelete({ children, onDelete, label = 'Delete', accessibilityLabel }: {
  children: React.ReactNode;
  onDelete: () => Promise<void> | void;
  label?: string;
  accessibilityLabel?: string;
}) {
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<ScrollView>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const del = async () => {
    tapLight();
    setBusy(true);
    try { await onDelete(); } finally { setBusy(false); ref.current?.scrollTo({ x: 0, animated: true }); }
  };

  return (
    <View onLayout={onLayout}>
      {width > 0 ? (
        <ScrollView
          ref={ref}
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          snapToOffsets={[0, ACTION_W]}
          snapToEnd={false}
          decelerationRate="fast"
          directionalLockEnabled
        >
          <View style={{ width }}>{children}</View>
          <Pressable
            onPress={del}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            className="items-center justify-center rounded-2xl ml-2 mb-3 active:opacity-80"
            style={{ width: ACTION_W - 8, backgroundColor: '#DC2626' }}
          >
            {busy ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="trash-outline" size={20} color="#fff" />
                <Text className="text-xs font-bold text-white mt-1">{label}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      ) : children}
    </View>
  );
}
