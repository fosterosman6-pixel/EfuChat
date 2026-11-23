import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ComingSoon } from '../components/ComingSoon';
import { IconButton } from '../components/ui';
import { colors } from '../lib/theme';

export default function Reels() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.navy, paddingTop: insets.top }}>
      <IconButton name="back" label="Back" onPress={() => router.back()} />
      <ComingSoon
        dark
        icon="reels"
        title="Reels are coming"
        text="Swipe through short videos from Mangochi and beyond. With data saver on, they play in lower quality to save bundles."
      />
    </View>
  );
}
