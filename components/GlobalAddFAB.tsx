import { useState } from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QuickAddSheet from '@/components/QuickAddSheet';

/** The floating "+" — opens the quick-add sheet (components/QuickAddSheet). */
export default function GlobalAddFAB() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable
        className="absolute bottom-20 right-5 bg-rally-600 w-14 h-14 rounded-full items-center justify-center shadow-lg active:opacity-80"
        style={{ elevation: 6, zIndex: 50 }}
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Add"
        testID="plus-button"
      >
        <Ionicons name="add" size={28} color="#FEFEFE" />
      </Pressable>
      <QuickAddSheet visible={visible} onClose={() => setVisible(false)} />
    </>
  );
}
