import { useEffect } from 'react';
import { router } from 'expo-router';

// Deprecated: redirects to consolidated Email & Sync screen
export default function TravelSyncScreen() {
  useEffect(() => {
    router.replace('/settings/email-connect');
  }, []);
  return null;
}
