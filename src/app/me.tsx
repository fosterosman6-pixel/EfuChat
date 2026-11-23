import { signOut } from '@react-native-firebase/auth';
import { unregisterPush } from '../lib/push';
import { router } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Card, Header, Icon, IconButton, Row, SectionLabel, T, Tile, Toggle } from '../components/ui';
import { auth } from '../lib/firebase';
import { useLang } from '../lib/i18n';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';

const chev = <Icon name="chev" color={colors.muted} size={18} />;

export default function Me() {
  const { profile, user } = useSession();
  const { lang, setLang } = useLang();
  const { dataSaver, setDataSaver } = usePrefs();
  const insets = useSafeAreaInsets();

  function confirmSignOut() {
    Alert.alert('Sign out?', 'You can sign in again with your phone number.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          if (profile?.uid) await unregisterPush(profile.uid);
          await signOut(auth);
          router.replace('/welcome');
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconButton name="back" label="Back to Home" onPress={() => router.back()} />
          <Avatar name={profile?.name ?? 'Me'} size={60} rounded={18} />
          <View style={{ flex: 1 }}>
            <T style={{ color: '#FFFFFF', fontSize: 20, fontFamily: fonts.extrabold }} numberOfLines={1}>
              {profile?.name}
            </T>
            <T style={{ color: colors.soft, fontSize: 13 }} numberOfLines={1}>
              {user?.phoneNumber} · {profile?.about}
            </T>
          </View>
        </View>
      </Header>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <SectionLabel>YOU</SectionLabel>
        <Card>
          <Row left={<Tile name="person" bg={colors.lime100} fg={colors.navy} />} title="Edit profile" subtitle="Name, username, about and town" onPress={() => router.push('/edit-profile')} />
          <Row left={<Tile name="wallet" bg={colors.lime100} fg={colors.navy} />} title="Wallet" subtitle="Coming soon" />
          <Row left={<Tile name="store" bg={colors.lime100} fg={colors.navy} />} title="My shop and orders" subtitle="Coming soon" />
          <Row left={<Tile name="phone" bg={colors.lime100} fg={colors.navy} />} title="Calls" subtitle="Voice calls and missed calls" onPress={() => router.push('/calls')} last />
        </Card>

        <SectionLabel>APP</SectionLabel>
        <Card>
          <Row
            left={<Tile name="data" bg={colors.surface100} fg={colors.navy} />}
            title="Data saver"
            subtitle="Smaller photos, media only when you tap"
            right={<Toggle value={dataSaver} onChange={setDataSaver} label="Data saver" />}
          />
          <Row
            left={<Tile name="globe" bg={colors.surface100} fg={colors.navy} />}
            title="Language"
            subtitle={lang === 'ny' ? 'Chichewa' : 'English'}
            right={chev}
            onPress={() => setLang(lang === 'ny' ? 'en' : 'ny')}
          />
          <Row left={<Tile name="lock" bg={colors.surface100} fg={colors.navy} />} title="Privacy and security" subtitle="Last seen, read ticks, calls, app lock" onPress={() => router.push('/privacy')} />
          <Row left={<Tile name="help" bg={colors.surface100} fg={colors.navy} />} title="Help" subtitle="Questions and support" onPress={() => router.push('/help')} last />
        </Card>

        <View style={{ height: 12 }} />
        <Card>
          <Row left={<Tile name="logout" bg={colors.dangerTint} fg={colors.danger} />} title="Sign out" danger onPress={confirmSignOut} last />
        </Card>
      </ScrollView>
    </View>
  );
}
