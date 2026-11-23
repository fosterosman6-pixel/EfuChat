import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, View } from 'react-native';
import { usePrefs } from '../lib/prefs';
import { colors, fonts } from '../lib/theme';
import { Button, Icon, T } from './ui';

/** Re-locks after the app has been in the background for this long. */
const GRACE_MS = 30_000;

/** Covers the app until fingerprint, face or phone PIN succeeds, when App lock is on. */
export function AppLock() {
  const { appLock } = usePrefs();
  const [locked, setLocked] = useState(false);
  const away = useRef<number | null>(null);
  const first = useRef(true);

  const unlock = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock EfuChat', fallbackLabel: 'Use PIN' }).catch(() => null);
    if (r?.success) setLocked(false);
  }, []);

  // Lock on start once the saved setting has loaded.
  useEffect(() => {
    if (appLock && first.current) {
      first.current = false;
      setLocked(true);
      unlock();
    }
  }, [appLock, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (!appLock) return;
      if (s === 'background') away.current = Date.now();
      if (s === 'active' && away.current && Date.now() - away.current > GRACE_MS) {
        setLocked(true);
        unlock();
      }
      if (s === 'active') away.current = null;
    });
    return () => sub.remove();
  }, [appLock, unlock]);

  if (!appLock || !locked) return null;
  return (
    <Modal visible animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
        <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="lock" color={colors.navy} size={40} />
        </View>
        <T style={{ color: '#FFFFFF', fontSize: 22, fontFamily: fonts.extrabold }}>EfuChat is locked</T>
        <T style={{ color: colors.soft, textAlign: 'center' }}>Use your fingerprint, face or phone PIN to open.</T>
        <Button title="Unlock" icon="lock" onPress={unlock} style={{ alignSelf: 'stretch', marginTop: 12 }} />
      </View>
    </Modal>
  );
}
