import { Redirect } from 'expo-router';

/** Placeholder route for the centre + button; the tab bar opens /create instead. */
export default function CreateTab() {
  return <Redirect href="/create" />;
}
