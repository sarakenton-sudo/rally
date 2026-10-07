import { Redirect } from 'expo-router';

// rally-hub.com/app (used in older emails): open the app's home. The root
// layout then sends coaches to Today and fans to their season.
export default function AppLink() {
  return <Redirect href="/" />;
}
