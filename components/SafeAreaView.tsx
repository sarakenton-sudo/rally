import { View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Edge = 'top' | 'bottom' | 'left' | 'right';

/**
 * Always import SafeAreaView from here, not react-native-safe-area-context.
 *
 * On iOS (NativeWind v5 + SDK 55) the library's native SafeAreaView rendered
 * screens blank — every stack/modal screen that used it (Add Hotel, Forward,
 * Paste/AI, Add Athlete, tournament detail) showed nothing, while the tabs,
 * which pad with useSafeAreaInsets, were fine. This is a plain core View —
 * which NativeWind always styles — padded by the same insets.
 */
export function SafeAreaView({
  edges = ['top', 'bottom', 'left', 'right'],
  style,
  ...props
}: ViewProps & { edges?: readonly Edge[]; className?: string }) {
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: edges.includes('top') ? insets.top : undefined,
    paddingBottom: edges.includes('bottom') ? insets.bottom : undefined,
    paddingLeft: edges.includes('left') ? insets.left : undefined,
    paddingRight: edges.includes('right') ? insets.right : undefined,
  };
  return <View {...props} style={[style, pad]} />;
}
