import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Share, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Card, Header, Icon, Row, SectionLabel, T, Tile } from '../components/ui';
import { findUserByPhone, openDirectChat } from '../lib/chats';
import { useLang } from '../lib/i18n';
import { COUNTRIES, toE164 } from '../lib/phone';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';
import type { UserProfile } from '../lib/types';

export default function NewChat() {
  const { t } = useLang();
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [number, setNumber] = useState('');
  const [found, setFound] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<'idle' | 'searching' | 'none'>('idle');

  async function search() {
    // Numbers typed without a country code are treated as Malawi numbers.
    const phone = number.trim().startsWith('+') ? '+' + number.replace(/\D/g, '') : toE164(COUNTRIES[0].dial, number);
    if (phone.length < 10) return;
    setStatus('searching');
    const u = await findUserByPhone(phone).catch(() => null);
    setFound(u && u.uid !== profile?.uid ? u : null);
    setStatus(u ? 'idle' : 'none');
  }

  async function start(other: UserProfile) {
    if (!profile) return;
    const id = await openDirectChat(profile, other);
    router.replace({ pathname: '/chat/[id]', params: { id } });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface100 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={t('newChat')} onBack={() => router.back()}>
        <View style={{ marginLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.navy700, borderRadius: 14, paddingHorizontal: 12, height: 46 }}>
          <Icon name="search" color={colors.soft} size={18} />
          <TextInput
            accessibilityLabel="Phone number"
            value={number}
            onChangeText={(v) => {
              setNumber(v);
              setStatus('idle');
              setFound(null);
            }}
            onSubmitEditing={search}
            keyboardType="phone-pad"
            returnKeyType="search"
            placeholder="Phone number, e.g. 099 123 4567"
            placeholderTextColor={colors.soft}
            style={{ flex: 1, color: '#FFFFFF', fontSize: 15, fontFamily: fonts.regular }}
          />
        </View>
      </Header>

      <View style={{ padding: 12 }}>
        <Button title="Find on EfuChat" variant="navy" icon="search" onPress={search} loading={status === 'searching'} disabled={!number} />
      </View>

      {found && (
        <>
          <SectionLabel>ON EFUCHAT</SectionLabel>
          <Card>
            <Row
              left={<Avatar name={found.name} />}
              title={found.name}
              subtitle={found.about ?? 'On EfuChat'}
              right={<Icon name="chat" color={colors.navy} />}
              onPress={() => start(found)}
              last
            />
          </Card>
        </>
      )}
      {status === 'none' && (
        <T style={{ paddingHorizontal: 16, paddingTop: 8, color: colors.muted, fontSize: 14 }}>
          This number is not on EfuChat yet. Invite them below.
        </T>
      )}

      <SectionLabel>MORE</SectionLabel>
      <Card>
        <Row left={<Tile name="group" bg={colors.lime} fg={colors.navy} />} title="New group" subtitle="Coming soon" />
        <Row left={<Tile name="qr" bg={colors.navy} fg={colors.lime} />} title="Scan code" subtitle="Coming soon" last />
      </Card>

      <View style={{ flex: 1 }} />
      <View style={{ padding: 12, paddingBottom: insets.bottom + 12 }}>
        <Button
          title="Invite friends to EfuChat"
          icon="share"
          onPress={() => Share.share({ message: 'Chat with me on EfuChat: chat, send money and book a matola, all in one app.' })}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
