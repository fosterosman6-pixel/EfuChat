import { Pressable, View } from 'react-native';
import { colors, fonts } from '../lib/theme';
import { Avatar, Icon, T } from './ui';

export function StoryRing({ name, seen, onPress, label, uri }: { name: string; seen: boolean; onPress: () => void; label: string; uri?: string | null }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Story from ${name}${seen ? '' : ', new'}`} onPress={onPress} style={{ alignItems: 'center', gap: 6, width: 76 }}>
      <View style={{ width: 70, height: 70, borderRadius: 999, borderWidth: 3, borderColor: seen ? colors.muted : colors.lime, padding: 3 }}>
        <Avatar name={name} size={58} rounded={999} uri={uri} />
      </View>
      <T style={{ fontSize: 13, color: '#E3E8F2' }} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

/** My own ring: my photo with a + to add; tapping shows my stories when I have some. */
export function MyStoryRing({ label, name, uri, hasStories, onView, onAdd }: { label: string; name: string; uri?: string | null; hasStories: boolean; onView: () => void; onAdd: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={hasStories ? 'Your story' : 'Add to your story'} onPress={hasStories ? onView : onAdd} style={{ alignItems: 'center', gap: 6, width: 76 }}>
      <View style={{ width: 70, height: 70, borderRadius: 999, borderWidth: hasStories ? 3 : 2, borderStyle: hasStories ? 'solid' : 'dashed', borderColor: hasStories ? colors.lime : colors.soft, padding: 3 }}>
        <Avatar name={name} size={hasStories ? 58 : 60} rounded={999} uri={uri} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add to your story"
          onPress={onAdd}
          hitSlop={8}
          style={{ position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.lime, borderWidth: 3, borderColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="plus" color={colors.navy} size={14} />
        </Pressable>
      </View>
      <T style={{ fontSize: 13, color: '#FFFFFF', fontFamily: fonts.bold }} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

export function AddStoryRing({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Add to your story" onPress={onPress} style={{ alignItems: 'center', gap: 6, width: 76 }}>
      <View style={{ width: 70, height: 70, borderRadius: 999, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="plus" color={colors.lime} size={26} />
      </View>
      <T style={{ fontSize: 13, color: '#FFFFFF', fontFamily: fonts.bold }} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}
