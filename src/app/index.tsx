import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '../lib/session';
import { colors } from '../lib/theme';

/** Sends people to the right place: sign-up, profile setup, or Home. */
export default function Index() {
  const { user, profile } = useSession();

  if (user === undefined || (user && profile === undefined)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.lime} />
      </View>
    );
  }
  if (!user) return <Redirect href="/welcome" />;
  if (!profile) return <Redirect href="/profile-setup" />;
  return <Redirect href="/home" />;
}
