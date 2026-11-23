import { View } from 'react-native';
import { ComingSoon } from '../../components/ComingSoon';
import { Header } from '../../components/ui';

export default function Market() {
  return (
    <View style={{ flex: 1 }}>
      <Header title="Market" subtitle="Mangochi · 10 km" />
      <ComingSoon
        icon="bag"
        title="Buy and sell near you"
        text="Sell items, pay safely from your wallet and get them delivered by matola. Coming in a later update."
      />
    </View>
  );
}
