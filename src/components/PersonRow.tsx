import type { ReactNode } from 'react';
import { View } from 'react-native';
import { colors } from '../lib/theme';
import { Avatar, Icon, Row } from './ui';

export function PersonRow({ name, sub, online, onPress, right, last }: { name: string; sub?: string; online?: boolean; onPress?: () => void; right?: ReactNode; last?: boolean }) {
  return (
    <Row
      left={
        <View>
          <Avatar name={name} size={44} rounded={14} />
          {online && <View style={{ position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#3BD16F', borderWidth: 2, borderColor: '#FFFFFF' }} />}
        </View>
      }
      title={name}
      subtitle={sub}
      right={right ?? <Icon name="chat" color={colors.navy} size={20} />}
      onPress={onPress}
      last={last}
    />
  );
}

