import type { ComponentProps, ComponentType } from 'react';
import { SafeAreaView as BaseSafeAreaView } from 'react-native-safe-area-context';
import { styled } from 'nativewind';

/**
 * Always import SafeAreaView from here, not react-native-safe-area-context.
 *
 * NativeWind v5 (react-native-css) only wraps SafeAreaProvider on native — the
 * raw SafeAreaView silently ignores `className` on iOS/Android. Screens lost
 * `flex-1` + background, so their content collapsed to zero height (blank
 * modals in TestFlight) while web looked fine.
 */
export const SafeAreaView = styled(BaseSafeAreaView, { className: 'style' }) as ComponentType<
  ComponentProps<typeof BaseSafeAreaView> & { className?: string }
>;
