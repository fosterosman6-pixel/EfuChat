import { Pressable, View } from 'react-native';
import { colors, fonts } from '../lib/theme';
import { Avatar, Icon, T } from './ui';

export function StoryRing({ name, seen, onPress, label }: { name: string; seen: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Story from ${name}`} onPress={onPress} style={{ alignItems: 'center', gap: 4, width: 60 }}>
      <View style={{ width: 56, height: 56, borderRadius: 999, borderWidth: 3, borderColor: seen ? colors.muted : colors.lime, padding: 2 }}>
        <View style={{ flex: 1, borderRadius: 999, overflow: 'hidden' }}>
          <Avatar name={name} size={46} rounded={999} />
        </View>
      </View>
      <T style={{ fontSize: 11, color: '#E3E8F2' }} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

export function AddStoryRing({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Add to your story" onPress={onPress} style={{ alignItems: 'center', gap: 4, width: 60 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 999,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: colors.lime,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="plus" color={colors.lime} size={22} />
      </View>
      <T style={{ fontSize: 11, color: '#FFFFFF', fontFamily: fonts.bold }} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}
