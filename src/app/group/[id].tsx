import { dialog } from '../../components/Dialog';
import { doc, getDoc } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PersonRow } from '../../components/PersonRow';
import { Avatar, Card, Icon, IconButton, Row, SectionLabel, T, Tile, Toggle, ScaledTextInput } from '../../components/ui';
import { canEditGroup, isAdmin, leaveGroup, openDirectChat, removeGroupMember, setGroupAdmin, setMuted, subscribeChat, updateGroup } from '../../lib/chats';
import * as ImagePicker from 'expo-image-picker';
import { WallpaperPicker, WALLPAPERS } from '../../components/Wallpaper';
import { avatarDataUri } from '../../lib/media';
import { usePrefs } from '../../lib/prefs';
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
  const [desc, setDesc] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [wpOpen, setWpOpen] = useState(false);
  const { wallpaperFor } = usePrefs();
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
  const canEdit = canEditGroup(chat, me);
  const muted = !!chat.muted?.[me];
  const fail = () => dialog('Not allowed', 'Only group admins can do that.');

  const members = [...chat.members].sort((a, b) => (a === me ? -1 : b === me ? 1 : Number(isAdmin(chat, b)) - Number(isAdmin(chat, a)) || (chat.names[a] ?? '').localeCompare(chat.names[b] ?? '')));

  function memberMenu(uid: string) {
    if (uid === me) return;
    const n = chat!.names[uid] ?? 'this person';
    const isAdm = isAdmin(chat, uid);
    dialog(n, undefined, [
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
    dialog('Exit group?', lastAdmin ? 'You are the only admin. Make someone else admin first, or they will not be able to manage the group.' : 'You will stop getting messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Exit',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroup(chat!.id, me);
            router.dismissAll();
          } catch {
            dialog('Could not exit', 'Try again.');
          }
        },
      },
    ]);
  }

  async function saveInfo() {
    const n = name.trim();
    const d = desc.trim().slice(0, 300);
    setEditing(false);
    const data: { groupName?: string; description?: string } = {};
    if (n.length >= 2 && n !== chat!.groupName) data.groupName = n.slice(0, 50);
    if (d !== (chat!.description ?? '')) data.description = d;
    if (Object.keys(data).length) await updateGroup(chat!.id, data).catch(fail);
  }

  async function choosePhoto(source: 'camera' | 'gallery') {
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return dialog('Permission needed', source === 'camera' ? 'Allow the camera to take a group photo.' : 'Allow photos to choose a group photo.');
    const opts = { mediaTypes: ['images'] as ImagePicker.MediaType[], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.8 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    setPhotoBusy(true);
    try {
      await updateGroup(chat!.id, { photoURL: await avatarDataUri(res.assets[0].uri) });
    } catch {
      dialog('Could not set the photo', 'Try another photo, or check your connection.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function photoMenu() {
    if (!canEdit) return fail();
    dialog('Group photo', undefined, [
      { text: 'Take a photo', onPress: () => choosePhoto('camera') },
      { text: 'Choose from gallery', onPress: () => choosePhoto('gallery') },
      ...(chat!.photoURL ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => updateGroup(chat!.id, { photoURL: null }).catch(fail) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface100 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <View style={{ backgroundColor: colors.navy, paddingTop: insets.top + 6, paddingBottom: 18, paddingHorizontal: 4, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, alignItems: 'center', gap: 6 }}>
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between' }}>
          <IconButton name="back" label="Back" onPress={() => router.back()} />
          {canEdit && (
            <IconButton
              name={editing ? 'check' : 'edit'}
              label={editing ? 'Save' : 'Edit name and description'}
              onPress={() => {
                if (editing) return saveInfo();
                setName(chat.groupName ?? '');
                setDesc(chat.description ?? '');
                setEditing(true);
              }}
            />
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Group photo" onPress={photoMenu} style={{ alignItems: 'center' }}>
          {chat.photoURL ? <Avatar name={chat.groupName ?? 'Group'} uri={chat.photoURL} size={104} rounded={30} /> : <Tile name="group" bg={colors.lime} fg={colors.navy} size={104} />}
          {canEdit && (
            <View style={{ position: 'absolute', right: -6, bottom: -6, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.lime, borderWidth: 3, borderColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera" color={colors.navy} size={18} />
            </View>
          )}
        </Pressable>
        {photoBusy && <T style={{ color: colors.soft, fontSize: 12 }}>Saving photo…</T>}
        {editing ? (
          <ScaledTextInput
            accessibilityLabel="Group name"
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={50}
            style={{ minWidth: 220, textAlign: 'center', color: '#FFFFFF', fontSize: 22, fontFamily: fonts.extrabold, borderBottomWidth: 2, borderColor: colors.lime, paddingVertical: 4 }}
          />
        ) : (
          <T style={{ color: '#FFFFFF', fontSize: 22, fontFamily: fonts.extrabold, textAlign: 'center', paddingHorizontal: 16 }}>{chat.groupName ?? 'Group'}</T>
        )}
        <T style={{ color: colors.soft, fontSize: 14 }}>
          {`Group · ${chat.members.length} members${chat.createdBy ? ` · created by ${chat.createdBy === me ? 'you' : (chat.names[chat.createdBy] ?? 'someone').split(' ')[0]}` : ''}`}
        </T>
        {editing ? (
          <ScaledTextInput
            accessibilityLabel="Group description"
            value={desc}
            onChangeText={setDesc}
            placeholder="Add a description"
            placeholderTextColor={colors.soft}
            multiline
            maxLength={300}
            style={{ alignSelf: 'stretch', marginHorizontal: 16, marginTop: 6, color: '#FFFFFF', fontSize: 15, textAlign: 'center', borderWidth: 1, borderColor: colors.lime, borderRadius: 14, padding: 10 }}
          />
        ) : chat.description ? (
          <T style={{ color: '#FFFFFF', opacity: 0.92, fontSize: 15, textAlign: 'center', paddingHorizontal: 20, lineHeight: 21 }}>{chat.description}</T>
        ) : canEdit ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setName(chat.groupName ?? '');
              setDesc('');
              setEditing(true);
            }}
          >
            <T style={{ color: colors.lime, fontFamily: fonts.bold, fontSize: 15 }}>+ Add a description</T>
          </Pressable>
        ) : null}
        {editing && (
          <Pressable accessibilityRole="button" onPress={saveInfo} style={{ marginTop: 6, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.lime }}>
            <T style={{ color: colors.navy, fontFamily: fonts.extrabold }}>Save</T>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 14 }}>
        <Action icon="phone" label="Call" onPress={() => dialog('Coming soon', 'Group calls are coming soon.')} />
        <Action icon="person" label="Add" onPress={() => (admin ? router.push({ pathname: '/new-group', params: { add: chat.id } }) : fail())} />
        <Action icon="link" label="Invite" onPress={() => dialog('Coming soon', 'Invite links are coming soon. For now, an admin can add people.')} />
        <Action icon="search" label="Search" onPress={() => dialog('Coming soon', 'Searching messages is coming soon.')} />
      </View>

      <View style={{ height: 12 }} />
      <Card>
        <Row left={<Tile name="image" bg={colors.surface100} fg={colors.navy} />} title="Photos and voice notes" subtitle="Everything shared in this group" right={<Icon name="chev" color={colors.muted} size={18} />} onPress={() => router.push({ pathname: '/chat-media/[id]', params: { id: chat.id } })} />
        <Row
          left={<Tile name="bell" bg={colors.surface100} fg={colors.navy} />}
          title="Mute notifications"
          subtitle={muted ? 'On: no sound or pop-ups from this group' : 'Off'}
          right={<Toggle value={muted} onChange={(v) => setMuted(chat.id, me, v).catch(() => dialog('Could not update', 'Try again.'))} label="Mute notifications" />}
        />
        <Row left={<Tile name="palette" bg={colors.surface100} fg={colors.navy} />} title="Wallpaper" subtitle={WALLPAPERS.find((w) => w.name === wallpaperFor(chat.id))?.label} right={<Icon name="chev" color={colors.muted} size={18} />} onPress={() => setWpOpen(true)} last />
      </Card>

      {admin && (
        <>
          <SectionLabel>ADMIN SETTINGS</SectionLabel>
          <Card>
            <Row
              left={<Tile name="lock" bg={colors.surface100} fg={colors.navy} />}
              title="Only admins can send"
              subtitle="Members can still read"
              right={<Toggle value={!!chat.adminsOnly} onChange={(v) => updateGroup(chat.id, { adminsOnly: v }).catch(fail)} label="Only admins can send" />}
            />
            <Row
              left={<Tile name="edit" bg={colors.surface100} fg={colors.navy} />}
              title="Only admins can edit info"
              subtitle="Name, photo and description"
              right={<Toggle value={chat.adminsEdit !== false} onChange={(v) => updateGroup(chat.id, { adminsEdit: v }).catch(fail)} label="Only admins can edit info" />}
              last
            />
          </Card>
        </>
      )}

      <SectionLabel>{admin ? `${chat.members.length} MEMBERS · TAP TO MANAGE` : `${chat.members.length} MEMBERS`}</SectionLabel>
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
        <Row left={<Tile name="flag" bg={colors.dangerTint} fg={colors.danger} />} title="Report group" danger onPress={() => dialog('Thanks', 'Reports go to the EfuChat team once reporting is switched on.')} last />
      </Card>
      <WallpaperPicker visible={wpOpen} chatId={chat.id} onClose={() => setWpOpen(false)} />
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
