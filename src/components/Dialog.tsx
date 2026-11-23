import { useEffect, useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../lib/theme';
import { T } from './ui';

/**
 * EfuChat's own pop-ups, used instead of Android's grey alerts. Android only shows three
 * buttons, so longer menus lost their options (often Cancel). Same call shape as Alert.alert.
 */
export type DialogButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
type State = { title: string; message?: string; buttons: DialogButton[] } | null;

let show: (s: State) => void = () => {};

export function dialog(title: string, message?: string, buttons?: DialogButton[]) {
  show({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
}

export function DialogHost() {
  const [s, setS] = useState<State>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    show = setS;
    return () => {
      show = () => {};
    };
  }, []);
  useEffect(() => {
    if (!s) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setS(null);
      return true;
    });
    return () => sub.remove();
  }, [s]);
  if (!s) return null;

  const press = (b?: DialogButton) => {
    setS(null);
    if (b?.onPress) setTimeout(b.onPress, 0);
  };
  const cancel = s.buttons.find((b) => b.style === 'cancel');
  const actions = s.buttons.filter((b) => b.style !== 'cancel');
  const simple = s.buttons.length === 1;

  // A plain message: centred card with one button.
  if (simple) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => press()}>
        <View style={{ flex: 1, backgroundColor: 'rgba(10,34,83,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View accessibilityViewIsModal style={{ alignSelf: 'stretch', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 22, gap: 10 }}>
            <T style={{ fontFamily: fonts.extrabold, fontSize: 19 }}>{s.title}</T>
            {!!s.message && <T style={{ color: colors.muted, lineHeight: 22 }}>{s.message}</T>}
            <Pressable accessibilityRole="button" onPress={() => press(s.buttons[0])} style={{ marginTop: 8, minHeight: 52, borderRadius: 16, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
              <T style={{ fontFamily: fonts.extrabold, color: colors.navy, fontSize: 16 }}>{s.buttons[0].text ?? 'OK'}</T>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  // Choices: bottom sheet with every option, and Cancel always last.
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => press(cancel)}>
      <Pressable accessibilityLabel="Cancel" style={{ flex: 1, backgroundColor: 'rgba(10,34,83,0.55)' }} onPress={() => press(cancel)} />
      <View accessibilityViewIsModal style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 16, maxHeight: '85%' }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line, marginBottom: 12 }} />
        <T style={{ fontFamily: fonts.extrabold, fontSize: 19, paddingHorizontal: 4 }}>{s.title}</T>
        {!!s.message && <T style={{ color: colors.muted, lineHeight: 22, paddingHorizontal: 4, marginTop: 6 }}>{s.message}</T>}
        <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ gap: 8 }}>
          {actions.map((b, i) => {
            const danger = b.style === 'destructive';
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                onPress={() => press(b)}
                style={({ pressed }) => ({ minHeight: 56, borderRadius: 16, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: pressed ? colors.surface100 : danger ? colors.dangerTint : colors.surface100 })}
              >
                <T style={{ fontFamily: fonts.bold, fontSize: 16, color: danger ? colors.danger : colors.ink }}>{b.text}</T>
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={() => press(cancel)}
            style={({ pressed }) => ({ minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.navy, backgroundColor: pressed ? colors.surface100 : '#FFFFFF', marginTop: 4 })}
          >
            <T style={{ fontFamily: fonts.extrabold, fontSize: 16, color: colors.navy }}>{cancel?.text ?? 'Cancel'}</T>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
