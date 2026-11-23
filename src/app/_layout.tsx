import {
  OpenSans_400Regular,
  OpenSans_600SemiBold,
  OpenSans_700Bold,
  OpenSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/open-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LangProvider } from '../lib/i18n';
import { PrefsProvider } from '../lib/prefs';
import { SessionProvider } from '../lib/session';
import { colors } from '../lib/theme';

export default function RootLayout() {
  const [loaded] = useFonts({ OpenSans_400Regular, OpenSans_600SemiBold, OpenSans_700Bold, OpenSans_800ExtraBold });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.navy }} />;

  return (
    <SafeAreaProvider>
      <LangProvider>
        <PrefsProvider>
          <SessionProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface100 } }}>
              <Stack.Screen name="create" options={{ presentation: 'transparentModal', animation: 'fade' }} />
              <Stack.Screen name="story/[uid]" options={{ animation: 'fade', contentStyle: { backgroundColor: colors.navy } }} />
              <Stack.Screen name="new-story" options={{ animation: 'slide_from_bottom' }} />
            </Stack>
          </SessionProvider>
        </PrefsProvider>
      </LangProvider>
    </SafeAreaProvider>
  );
}
