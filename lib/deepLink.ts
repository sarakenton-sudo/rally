import { Linking } from 'react-native';

const APP_SCHEMES: Record<string, string> = {
  'GroupMe': 'groupme://',
  'LeagueApps': 'leagueapps://',
  'TeamSnap': 'teamsnap://',
};

export async function openDeepLink(link: { label: string; url: string }) {
  const scheme = APP_SCHEMES[link.label];
  if (scheme) {
    const canOpen = await Linking.canOpenURL(scheme);
    if (canOpen) {
      Linking.openURL(scheme);
      return;
    }
  }
  Linking.openURL(link.url);
}
