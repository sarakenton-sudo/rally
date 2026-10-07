import { Platform } from 'react-native';

// Bottom tab bar (parent, coach and fan). On the web the default bar is too
// short: labels were clipped ("Todav") and the phone's home-swipe bar sat on
// top of them. Give it room and pad by the safe area.
export const TAB_BAR_STYLE = {
  backgroundColor: '#1E3A5F',
  borderTopColor: 'rgba(255,255,255,0.07)',
  ...(Platform.OS === 'web'
    ? { height: 'calc(68px + env(safe-area-inset-bottom, 0px))', paddingTop: 6, paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }
    : {}),
} as any;

export const TAB_BAR_LABEL_STYLE = Platform.OS === 'web' ? { fontSize: 11, lineHeight: 16, paddingBottom: 2, overflow: 'visible' as const } : undefined;
