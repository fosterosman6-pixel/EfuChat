import { doc, getDoc } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PersonRow } from '../../components/PersonRow';
import { Card, IconButton, Row, SectionLabel, T, Tile, Toggle, ScaledTextInput } from '../../components/ui';
import { isAdmin, leaveGroup, openDirectChat, removeGroupMember, setGroupAdmin, subscribeChat, updateGroup } from '../../lib/chats';
import { db } from '../../lib/firebase';
import type { IconName } from '../../lib/icons';
import { isOnline, presenceLabel } from '../../lib/presence';
import { canSeePresence } from '../../lib/profile';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';
import type { Chat, UserProfile } from '../../lib/types';

export default function GroupInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<Chat | null>(null);
  const [users, setUsers] = useState<Record<string, UserProfile>>({});
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const me = profile?.uid ?? '';

  useEffect(() => (id ? subscribeChat(id, setChat) : undefined), [id]);

  // Profiles for online / last seen, fetched once per member.
  const memberKey = chat?.members.join(',') ?? '';
  useEffect(() => {
    if (!chat) return;
    Promise.all(chat.members.map((uid) => getDoc(doc(db, 'users', uid)).catch(() => null))).then((snaps) => {
      const map: Record<string, UserProfile> = {};
      for (const s of snaps) if (s?.exists()) map[s.id] = { uid: s.id, ...s.data() } as UserProfile;
      setUsers(map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey]);

  if (!chat) return <View style={{ flex: 1, backgroundColor: colors.surface100 }} />;
  const admin = isAdmin(chat, me);
  const fail = () => Alert.alert('Not allowed', 'Only group admins can do that.');

  const members = [...chat.members].sort((a, b) => (a === me ? -1 : b === me ? 1 : Number(isAdmin(chat, b)) - Number(isAdmin(chat, a)) || (chat.names[a] ?? '').localeCompare(chat.names[b] ?? '')));

  function memberMenu(uid: string) {
    if (uid === me) return;
    const n = chat!.names[uid] ?? 'this person';
    const isAdm = isAdmin(chat, uid);
    Alert.alert(n, undefined, [
      { text: `Message ${n.split(' ')[0]}`, onPress: async () => profile && router.push({ pathname: '/chat/[id]', params: { id: await openDirectChat(profile, { uid, name: n }) } }) },
      ...(admin
        ? [
            { text: isAdm ? 'Remove as admin' : 'Make group admin', onPress: () => setGroupAdmin(chat!.id, uid, !isAdm).catch(fail) },
            { text: `Remove ${n.split(' ')[0]}`, style: 'destructive' as const, onPress: () => removeGroupMember(chat!.id, uid).catch(fail) },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function exit() {
    const lastAdmin = admin && (chat!.admins?.length ?? 0) <= 1 && chat!.members.length > 1;
    Alert.alert('Exit group?', lastAdmin ? 'You are the only admin. Make someone else admin first, or they will not be able to manage the group.' : 'You will stop getting messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Exit',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup(chat!.id, me);
            router.dismissAll();
          } catch {
            Alert.alert('Could not exit', 'Try again.');
          }
        },
      },
    ]);
  }

  async function saveName() {
    const n = name.trim();
    setEditing(false);
    if (n.length >= 2 && n !== chat!.groupName) await updateGroup(chat!.id, { groupName: n.slice(0, 50) }).catch(fail);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface100 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={{ backgroundColor: colors.navy, paddingTop: insets.top + 6, paddingBottom: 18, paddingHorizontal: 4, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, alignItems: 'center', gap: 6 }}>
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between' }}>
          <IconButton name="back" label="Back" onPress={() => router.back()} />
          {admin && (
            <IconButton
              name="edit"
              label="Rename group"
              onPress={() => {
                setName(chat.groupName ?? '');
                setEditing(true);
              }}
            />
          )}
        </View>
        <Tile name="group" bg={colors.lime} fg={colors.navy} size={76} />
        {editing ? (
          <ScaledTextInput
            accessibilityLabel="Group name"
            value={name}
            onChangeText={setName}
            onSubmitEditing={saveName}
            onBlur={saveName}
            autoFocus
            maxLength={50}
            style={{ minWidth: 220, textAlign: 'center', color: '#FFFFFF', fontSize: 22, fontFamily: fonts.extrabold, borderBottomWidth: 2, borderColor: colors.lime, paddingVertical: 4 }}
          />
        ) : (
          <T style={{ color: '#FFFFFF', fontSize: 22, fontFamily: fonts.extrabold, textAlign: 'center', paddingHorizontal: 16 }}>{chat.groupName ?? 'Group'}</T>
        )}
        <T style={{ color: colors.soft, fontSize: 14 }}>{`Group · ${chat.members.length} members`}</T>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 14 }}>
        <Action icon="phone" label="Call" onPress={() => Alert.alert('Coming soon', 'Group calls are coming soon.')} />
        <Action icon="person" label="Add" onPress={() => (admin ? router.push({ pathname: '/new-group', params: { add: chat.id } }) : fail())} />
        <Action icon="link" label="Invite" onPress={() => Alert.alert('Coming soon', 'Invite links are coming soon. For now, an admin can add people.')} />
        <Action icon="search" label="Search" onPress={() => Alert.alert('Coming soon', 'Searching messages is coming soon.')} />
      </View>

      {admin && (
        <>
          <SectionLabel>SETTINGS</SectionLabel>
          <Card>
            <Row
              left={<Tile name="lock" bg={colors.surface100} fg={colors.navy} />}
              title="Only admins can send messages"
              right={<Toggle value={!!chat.adminsOnly} onChange={(v) => updateGroup(chat.id, { adminsOnly: v }).catch(fail)} label="Only admins can send" />}
              last
            />
          </Card>
        </>
      )}

      <SectionLabel>{`${chat.members.length} MEMBERS`}</SectionLabel>
      <Card>
        {members.map((uid, i) => (
          <PersonRow
            key={uid}
            uri={uid === me ? profile?.photoURL : users[uid]?.photoURL}
            name={uid === me ? 'You' : (chat.names[uid] ?? 'EfuChat user')}
            sub={uid === me ? profile?.name : canSeePresence(users[uid], profile, false) ? presenceLabel(users[uid]) : (users[uid]?.about ?? 'EfuChat')}
            online={uid !== me && canSeePresence(users[uid], profile, false) && isOnline(users[uid])}
            onPress={uid === me ? undefined : () => memberMenu(uid)}
            right={isAdmin(chat, uid) ? <T style={{ fontSize: 11, fontFamily: fonts.extrabold, color: colors.lime600, backgroundColor: colors.lime100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }}>Admin</T> : <View />}
            last={i === members.length - 1}
          />
        ))}
      </Card>

      <View style={{ height: 12 }} />
      <Card>
        <Row left={<Tile name="exit" bg={colors.dangerTint} fg={colors.danger} />} title="Exit group" danger onPress={exit} />
        <Row left={<Tile name="flag" bg={colors.dangerTint} fg={colors.danger} />} title="Report group" danger onPress={() => Alert.alert('Thanks', 'Reports go to the EfuChat team once reporting is switched on.')} last />
      </Card>
    </ScrollView>
  );
}

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#FFFFFF', borderRadius: 14 }}>
      <Tile name={icon} bg={colors.lime100} fg={colors.navy} />
      <T style={{ fontSize: 12, fontFamily: fonts.bold }}>{label}</T>
    </Pressable>
  );
}
