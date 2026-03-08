import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Light tap for button presses and selections */
export function tapLight() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

/** Medium tap for confirmations and saves */
export function tapMedium() {
  if (Platform.OS !== 'web') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
}

/** Success notification for completed actions */
export function notifySuccess() {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}

/** Error notification for failures */
export function notifyError() {
  if (Platform.OS !== 'web') {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

/** Selection changed (for toggles, pickers) */
export function selectionChanged() {
  if (Platform.OS !== 'web') {
    Haptics.selectionAsync();
  }
}
