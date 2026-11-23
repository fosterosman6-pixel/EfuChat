import {
  OpenSans_400Regular,
  OpenSans_600SemiBold,
  OpenSans_700Bold,
  OpenSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/open-sans';
import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { AppLock } from '../components/AppLock';
import { subscribeIncoming } from '../lib/calls';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LangProvider } from '../lib/i18n';
import { PrefsProvider } from '../lib/prefs';
import { usePresence } from '../lib/presence';
import { SessionProvider, useSession } from '../lib/session';
import { colors } from '../lib/theme';

export default function RootLayout() {
  const [loaded] = useFonts({ OpenSans_400Regular, OpenSans_600SemiBold, OpenSans_700Bold, OpenSans_800ExtraBold });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.navy }} />;

  return (
    <SafeAreaProvider>
      <LangProvider>
        <PrefsProvider>
          <SessionProvider>
            <Presence />
            <IncomingCalls />
            <AppLock />
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface100 } }}>
              <Stack.Screen name="create" options={{ presentation: 'transparentModal', animation: 'fade' }} />
              <Stack.Screen name="story/[uid]" options={{ animation: 'fade', contentStyle: { backgroundColor: colors.navy } }} />
              <Stack.Screen name="new-story" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="call/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false, contentStyle: { backgroundColor: colors.navy } }} />
            </Stack>
          </SessionProvider>
        </PrefsProvider>
      </LangProvider>
    </SafeAreaProvider>
  );
}

function Presence() {
  const { profile } = useSession();
  usePresence(profile?.uid, profile?.privacy?.lastSeen === 'nobody');
  return null;
}

/** Opens the call screen when someone rings me while the app is open. */
function IncomingCalls() {
  const { profile } = useSession();
  const path = usePathname();
  const shown = useRef(new Set<string>());
  const onCall = useRef(false);
  onCall.current = path.startsWith('/call/');

  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeIncoming(profile.uid, (calls) => {
      const c = calls[0];
      if (!c || shown.current.has(c.id) || onCall.current) return;
      shown.current.add(c.id);
      router.push({ pathname: '/call/[id]', params: { id: c.id } });
    });
  }, [profile?.uid]);
  return null;
}
