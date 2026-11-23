import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { usePhoto, voiceFile } from '../lib/media';
import { colors, fonts } from '../lib/theme';
import type { MediaRef } from '../lib/types';
import { Icon, T } from './ui';

const W = 230;

/** Photo inside a bubble: blurred thumbnail first, then the real photo. Tap for full screen. */
export function PhotoContent({ chatId, media, caption, from, time, onLongPress }: { chatId: string; media: MediaRef; caption: string; from: string; time: string; onLongPress: () => void }) {
  const uri = usePhoto(chatId, media);
  const ratio = media.w && media.h ? media.h / media.w : 0.75;
  const h = Math.round(Math.min(Math.max(W * ratio, 120), 320));
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={caption ? `Photo: ${caption}` : 'Photo'}
      onPress={() => uri && router.push({ pathname: '/photo', params: { chatId, mediaId: media.id, caption, from, time } })}
      onLongPress={onLongPress}
      delayLongPress={300}
    >
      <View style={{ width: W, height: h, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.navy700 }}>
        {media.thumb && <Image source={{ uri: media.thumb }} blurRadius={8} style={{ position: 'absolute', width: W, height: h }} />}
        {uri ? <Image source={{ uri }} style={{ width: W, height: h }} resizeMode="cover" /> : <ActivityIndicator color="#FFFFFF" style={{ marginTop: h / 2 - 10 }} />}
      </View>
    </Pressable>
  );
}

const BARS = [6, 12, 18, 10, 22, 14, 8, 16, 20, 12, 6, 14, 18, 10, 8, 12, 16, 6, 10, 14];
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Voice note player: loads the file on first play. */
export function VoiceContent({ chatId, media, mine }: { chatId: string; media: MediaRef; mine: boolean }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dur = status.duration || media.dur || 0;
  const pos = status.currentTime || 0;
  const done = dur ? pos / dur : 0;

  async function toggle() {
    if (status.playing) return player.pause();
    try {
      if (!loaded) {
        setBusy(true);
        player.replace({ uri: await voiceFile(chatId, media) });
        setLoaded(true);
      } else if (status.didJustFinish || (dur && pos >= dur - 0.2)) {
        await player.seekTo(0);
      }
      player.play();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'} onPress={toggle} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={colors.lime} size="small" /> : <Icon name={status.playing ? 'pause' : 'play'} color={colors.lime} size={18} />}
      </Pressable>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {BARS.map((h, i) => (
          <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i / BARS.length < done ? colors.navy : mine ? '#B9D98A' : colors.soft }} />
        ))}
      </View>
      <T style={{ fontSize: 12, color: colors.muted, fontFamily: fonts.semibold }}>{mmss(status.playing || pos > 0 ? pos : dur)}</T>
    </View>
  );
}
