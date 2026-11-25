import Constants from 'expo-constants';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, View } from 'react-native';
import { dialog } from './Dialog';
import { fileSize, mediaFile, usePhoto, voiceFile } from '../lib/media';
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

// ---------- documents, videos, audio, location, contact ----------
const EXT_COLORS: Record<string, string> = { PDF: '#D93025', DOC: '#2B579A', DOCX: '#2B579A', XLS: '#1F7A45', XLSX: '#1F7A45', CSV: '#1F7A45', PPT: '#C43E1C', PPTX: '#C43E1C', ZIP: '#6B4E16', TXT: '#4B5675' };
const extOf = (name?: string) => (name?.split('.').pop() ?? 'FILE').toUpperCase().slice(0, 4);

/** A document: coloured badge, name, type and size. Tap to open it in another app or save it. */
export function FileContent({ chatId, media, onLongPress }: { chatId: string; media: MediaRef; onLongPress: () => void }) {
  const [busy, setBusy] = useState(false);
  const ext = extOf(media.name);
  async function open() {
    setBusy(true);
    try {
      const uri = await mediaFile(chatId, media);
      const Sharing = await import('expo-sharing');
      await Sharing.shareAsync(uri, { mimeType: media.mime, dialogTitle: media.name ?? 'Open file' });
    } catch {
      dialog('Could not open the file', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Document ${media.name ?? ''}, ${fileSize(media.size)}. Open`} onPress={open} onLongPress={onLongPress} delayLongPress={300}>
      <View style={{ width: 240, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: 'rgba(10,34,83,0.05)' }}>
        <View style={{ width: 42, height: 50, borderRadius: 8, backgroundColor: EXT_COLORS[ext] ?? colors.navy, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 }}>
          <T style={{ color: '#FFFFFF', fontSize: 11, fontFamily: fonts.extrabold }}>{ext}</T>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 14 }} numberOfLines={2}>{media.name ?? 'Document'}</T>
          <T style={{ fontSize: 12, color: colors.muted }}>{`${ext} · ${fileSize(media.size)}`}</T>
        </View>
        {busy ? <ActivityIndicator color={colors.navy} /> : <Icon name="download" color={colors.navy} size={22} />}
      </View>
    </Pressable>
  );
}

/** A video: preview picture with a play button. Tap to watch full screen. */
export function VideoContent({ chatId, media, onLongPress }: { chatId: string; media: MediaRef; onLongPress: () => void }) {
  const ratio = media.w && media.h ? media.h / media.w : 0.6;
  const h = Math.round(Math.min(Math.max(W * ratio, 130), 300));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Video, ${mmss(media.dur ?? 0)}. Play`}
      onPress={() => router.push({ pathname: '/video', params: { chatId, mediaId: media.id, name: media.name ?? 'video.mp4', mime: media.mime ?? 'video/mp4', size: String(media.size ?? 0) } })}
      onLongPress={onLongPress}
      delayLongPress={300}
    >
      <View style={{ width: W, height: h, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.navy700, alignItems: 'center', justifyContent: 'center' }}>
        {media.thumb && <Image source={{ uri: media.thumb }} style={{ position: 'absolute', width: W, height: h }} resizeMode="cover" />}
        <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="play" color={colors.navy} size={28} />
        </View>
        <View style={{ position: 'absolute', left: 8, bottom: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(10,34,83,0.6)' }}>
          <T style={{ color: '#FFFFFF', fontSize: 12, fontFamily: fonts.bold }}>{`🎥 ${media.dur ? `${mmss(media.dur)} · ` : ''}${fileSize(media.size)}`}</T>
        </View>
      </View>
    </Pressable>
  );
}

/** An audio file (song, recording): name, length, size and a play button right in the chat. */
export function AudioContent({ chatId, media, onLongPress }: { chatId: string; media: MediaRef; onLongPress: () => void }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dur = status.duration || media.dur || 0;
  const pos = status.currentTime || 0;
  async function toggle() {
    if (status.playing) return player.pause();
    try {
      if (!loaded) {
        setBusy(true);
        player.replace({ uri: await mediaFile(chatId, media) });
        setLoaded(true);
      } else if (status.didJustFinish || (dur && pos >= dur - 0.2)) {
        await player.seekTo(0);
      }
      player.play();
    } catch {
      dialog('Could not play', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={300} style={{ width: 250, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#F5ECFA', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="music" color="#7B3FA0" size={22} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T style={{ fontFamily: fonts.bold, fontSize: 14 }} numberOfLines={1}>{media.name ?? 'Audio'}</T>
        <T style={{ fontSize: 12, color: colors.muted }}>{`${dur ? `${mmss(status.playing || pos > 0 ? pos : dur)} · ` : ''}${fileSize(media.size)}`}</T>
        {dur > 0 && (
          <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.line, marginTop: 5, overflow: 'hidden' }}>
            <View style={{ height: 3, width: `${Math.min(100, (pos / dur) * 100)}%`, backgroundColor: colors.navy }} />
          </View>
        )}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause' : 'Play'} onPress={toggle} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={colors.lime} size="small" /> : <Icon name={status.playing ? 'pause' : 'play'} color={colors.lime} size={18} />}
      </Pressable>
    </Pressable>
  );
}

/** A shared location: small map (when the build has a Maps key), the area name and Directions. */
export function LocationContent({ lat, lng, label, mine, onLongPress }: { lat: number; lng: number; label?: string; mine?: boolean; onLongPress: () => void }) {
  const open = () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
  const directions = () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  const mapsEnabled = !!(Constants.expoConfig?.extra as { mapsEnabled?: boolean } | undefined)?.mapsEnabled;
  let map: ReactNode = null;
  if (mapsEnabled) {
    // Loaded only when the build has a key, so the map library is never touched without one.
    const Maps = require('react-native-maps') as typeof import('react-native-maps');
    const MapView = Maps.default;
    map = (
      <MapView
        liteMode
        provider={Maps.PROVIDER_GOOGLE}
        pointerEvents="none"
        style={{ width: '100%', height: 150 }}
        initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        <Maps.Marker coordinate={{ latitude: lat, longitude: lng }} />
      </MapView>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Shared location${label ? `: ${label}` : ''}. Open in Maps`} onPress={open} onLongPress={onLongPress} delayLongPress={300} style={{ width: 250, gap: 8 }}>
      <View style={{ height: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: '#EAF6EE', alignItems: 'center', justifyContent: 'center' }}>
        {map ?? <Icon name="pin" color="#1F7A45" size={44} />}
      </View>
      <View style={{ paddingHorizontal: 2 }}>
        <T style={{ fontFamily: fonts.bold }}>{mine ? '📍 My location' : '📍 Location'}</T>
        <T style={{ fontSize: 13, color: colors.muted }} numberOfLines={2}>{label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}</T>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Directions" onPress={directions} style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.navy, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Icon name="pin" color={colors.lime} size={16} />
        <T style={{ color: '#FFFFFF', fontFamily: fonts.extrabold }}>Directions</T>
      </Pressable>
    </Pressable>
  );
}

/** A shared contact: name, number, and Call / Message buttons. */
export function ContactContent({ name, phone, onMessage, onLongPress }: { name: string; phone: string; onMessage: () => void; onLongPress: () => void }) {
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={300} style={{ width: 240, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFF4D6', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="person" color="#8A5A00" size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bold }} numberOfLines={1}>{name}</T>
          <T style={{ fontSize: 13, color: colors.muted }}>{phone}</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)} style={{ flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: colors.surface100, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontFamily: fonts.bold, color: colors.navy }}>Call</T>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onMessage} style={{ flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
          <T style={{ fontFamily: fonts.bold, color: '#FFFFFF' }}>Message</T>
        </Pressable>
      </View>
    </Pressable>
  );
}

/** Money sent in a chat: amount, note and whether it went through. */
export function MoneyContent({ amount, note, mine, sender, paymentId }: { amount: number; note?: string; mine: boolean; sender: string; paymentId: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${mine ? 'You sent' : `${sender} sent`} ${amount} kwacha`} onPress={() => router.push('/wallet')} style={{ width: 230, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="wallet" color={colors.lime} size={18} />
        </View>
        <T style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.muted }}>{mine ? 'You sent' : `${sender.split(' ')[0]} sent you`}</T>
      </View>
      <T style={{ fontSize: 24, fontFamily: fonts.extrabold }}>{`MK ${Math.round(amount).toLocaleString('en-US')}`}</T>
      {!!note && <T style={{ fontSize: 13, color: colors.muted }}>{note}</T>}
      <View style={{ alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.lime }}>
        <T style={{ fontSize: 11, fontFamily: fonts.extrabold, color: colors.navy }}>{`✓ Paid · ${paymentId.slice(-6)}`}</T>
      </View>
    </Pressable>
  );
}
