import { Redirect } from 'expo-router';

// The default stream now lives on Team Details (one place for team info).
export default function StreamingHubRedirect() {
  return <Redirect href="/settings/team-details" />;
}
