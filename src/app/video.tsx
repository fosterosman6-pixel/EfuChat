import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dialog } from '../components/Dialog';
import { IconButton, T } from '../components/ui';
import { fileSize, mediaFile } from '../lib/media';
import { colors, fonts } from '../lib/theme';

/** Full-screen video from a chat: downloads it once, then plays with the phone's controls. */
export default function VideoScreen() {
  const { chatId, mediaId, name, mime, size } = useLocalSearchParams<{ chatId: string; mediaId: string; name: string; mime: string; size: string }>();
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (!chatId || !mediaId) return;
    mediaFile(chatId, { id: mediaId, kind: 'video', name, mime, size: Number(size) || undefined })
      .then(setUri)
      .catch(() => setFailed(true));
  }, [chatId, mediaId, name, mime, size]);

  useEffect(() => {
    if (uri) player.play();
  }, [uri, player]);

  async function share() {
    if (!uri) return;
    try {
      const Sharing = await import('expo-sharing');
      await Sharing.shareAsync(uri, { mimeType: mime || 'video/mp4' });
    } catch {
      dialog('Could not share', 'Try again.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <View style={{ position: 'absolute', top: insets.top + 6, left: 6, right: 6, zIndex: 2, flexDirection: 'row', alignItems: 'center' }}>
        <IconButton name="back" label="Close video" onPress={() => router.back()} />
        <T style={{ flex: 1, color: '#FFFFFF', fontFamily: fonts.bold }} numberOfLines={1}>{name}</T>
        {uri && <IconButton name="share" label="Save or share" onPress={share} />}
      </View>
      {uri ? (
        <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {failed ? (
            <T style={{ color: '#FFFFFF' }}>Could not load the video. Check your connection.</T>
          ) : (
            <>
              <ActivityIndicator color={colors.lime} size="large" />
              <T style={{ color: '#FFFFFF' }}>{`Loading video${Number(size) ? ` · ${fileSize(Number(size))}` : ''}…`}</T>
            </>
          )}
        </View>
      )}
    </View>
  );
}
