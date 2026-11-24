import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';
import { usePrefs, type WallpaperName } from '../lib/prefs';
import { colors, fonts } from '../lib/theme';
import { Icon, T, Toggle } from './ui';

export const WALLPAPERS: { name: WallpaperName; label: string }[] = [
  { name: 'plain', label: 'Plain' },
  { name: 'chitenje', label: 'Chitenje' },
  { name: 'lake', label: 'Lake' },
  { name: 'night', label: 'Night' },
];
export const BG: Record<WallpaperName, string> = { plain: colors.surface100, chitenje: '#F3F5F9', lake: '#EEF4FA', night: '#0E1C3F' };

/** Draws a chat background. Fills its parent; put it behind the message list. */
export function WallpaperFill({ name, id = 'wp' }: { name: WallpaperName; id?: string }) {
  if (name === 'plain') return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BG.plain }} />;
  const pid = `${id}-${name}`;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0, backgroundColor: BG[name] }}>
      <Svg width="100%" height="100%">
        <Defs>
          {name === 'chitenje' && (
            <Pattern id={pid} width={64} height={64} patternUnits="userSpaceOnUse">
              <Rect x={0} y={28} width={64} height={8} fill={colors.navy} opacity={0.06} />
              <Path d="M32 6 L50 24 L32 42 L14 24 Z" fill="none" stroke={colors.lime} strokeWidth={2} strokeOpacity={0.35} />
              <Circle cx={32} cy={24} r={3} fill={colors.navy} opacity={0.1} />
              <Path d="M0 54 L8 48 L16 54 L24 48 L32 54 L40 48 L48 54 L56 48 L64 54" fill="none" stroke={colors.navy} strokeWidth={1.5} strokeOpacity={0.1} />
            </Pattern>
          )}
          {name === 'lake' && (
            <Pattern id={pid} width={80} height={40} patternUnits="userSpaceOnUse">
              <Path d="M0 12 Q10 4 20 12 T40 12 T60 12 T80 12" fill="none" stroke="#5B8DB8" strokeWidth={1.5} strokeOpacity={0.18} />
              <Path d="M0 32 Q10 24 20 32 T40 32 T60 32 T80 32" fill="none" stroke="#5B8DB8" strokeWidth={1.5} strokeOpacity={0.12} />
            </Pattern>
          )}
          {name === 'night' && (
            <Pattern id={pid} width={48} height={48} patternUnits="userSpaceOnUse">
              <Circle cx={8} cy={10} r={1.4} fill="#FFFFFF" opacity={0.35} />
              <Circle cx={30} cy={22} r={1} fill="#FFFFFF" opacity={0.25} />
              <Circle cx={18} cy={40} r={1.6} fill={colors.lime} opacity={0.3} />
            </Pattern>
          )}
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${pid})`} />
      </Svg>
    </View>
  );
}

/** Bottom sheet: pick a wallpaper for this chat, or for all chats. */
export function WallpaperPicker({ visible, chatId, onClose }: { visible: boolean; chatId?: string; onClose: () => void }) {
  const { wallpaperFor, setWallpaper } = usePrefs();
  const [pick, setPick] = useState<WallpaperName>(wallpaperFor(chatId));
  const [forAll, setForAll] = useState(!chatId);
  React.useEffect(() => {
    if (visible) {
      setPick(wallpaperFor(chatId));
      setForAll(!chatId);
    }
  }, [visible, chatId, wallpaperFor]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(10,34,83,0.45)' }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28, gap: 16 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
        <T style={{ fontFamily: fonts.bold, fontSize: 18 }}>Chat wallpaper</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {WALLPAPERS.map((w) => {
            const on = pick === w.name;
            return (
              <Pressable key={w.name} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={w.label} onPress={() => setPick(w.name)} style={{ alignItems: 'center', gap: 6 }}>
                <View style={{ width: 72, height: 108, borderRadius: 14, overflow: 'hidden', borderWidth: on ? 3 : 1, borderColor: on ? colors.lime : colors.line }}>
                  <WallpaperFill name={w.name} id={`thumb-${w.name}`} />
                  <View style={{ position: 'absolute', top: 16, left: 8, width: 40, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF' }} />
                  <View style={{ position: 'absolute', top: 36, right: 8, width: 36, height: 12, borderRadius: 6, backgroundColor: colors.lime100 }} />
                  {on && (
                    <View style={{ position: 'absolute', bottom: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={13} color={colors.navy} />
                    </View>
                  )}
                </View>
                <T style={{ fontSize: 13, fontFamily: on ? fonts.bold : fonts.regular }}>{w.label}</T>
              </Pressable>
            );
          })}
        </ScrollView>
        {!!chatId && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.semibold }}>Use for all chats</T>
              <T style={{ fontSize: 12, color: colors.muted }}>Otherwise only this chat changes</T>
            </View>
            <Toggle value={forAll} onChange={setForAll} label="Use for all chats" />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setWallpaper(pick, forAll ? undefined : chatId);
            onClose();
          }}
          style={{ backgroundColor: colors.navy, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}
        >
          <T style={{ color: '#FFFFFF', fontFamily: fonts.bold }}>Set wallpaper</T>
        </Pressable>
      </View>
    </Modal>
  );
}
