import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, T } from '../components/ui';
import { loadMedia } from '../lib/media';
import { colors, fonts } from '../lib/theme';

/** Full-screen photo from a chat. */
export default function Photo() {
  const { chatId, mediaId, caption, from, time } = useLocalSearchParams<{ chatId: string; mediaId: string; caption?: string; from?: string; time?: string }>();
  const insets = useSafeAreaInsets();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (chatId && mediaId) loadMedia(chatId, mediaId).then((d) => setUri(`data:image/jpeg;base64,${d}`), () => {});
  }, [chatId, mediaId]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 6, paddingHorizontal: 4, paddingBottom: 6 }}>
        <IconButton name="back" label="Back" onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <T style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 16 }}>{from ?? ''}</T>
          {!!time && <T style={{ color: colors.soft, fontSize: 12 }}>{time}</T>}
        </View>
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityLabel={caption || 'Photo'} /> : <ActivityIndicator color="#FFFFFF" />}
      </View>
      {!!caption && <T style={{ color: '#FFFFFF', padding: 16, paddingBottom: insets.bottom + 16 }}>{caption}</T>}
    </View>
  );
}
