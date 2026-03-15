import { useEffect } from 'react';
import { router } from 'expo-router';

// Deprecated: redirects to consolidated Email & Sync screen
export default function EmailMonitoringScreen() {
  useEffect(() => {
    router.replace('/settings/email-forward');
  }, []);
  return null;
}
