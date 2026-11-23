import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, onSnapshot } from '@react-native-firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PhotoContent, VoiceContent } from '../../components/MediaBubble';
import { Avatar, Header, Icon, IconButton, T } from '../../components/ui';
import {
  chatTitle,
  deleteForEveryone,
  isAdmin,
  markRead,
  pinMessage,
  react,
  sendMessage,
  setTyping,
  subscribeChat,
  subscribeMessages,
  whoIsTyping,
} from '../../lib/chats';
import { callLabel, startCall } from '../../lib/calls';
import { usePrefs } from '../../lib/prefs';
import { WallpaperFill, WallpaperPicker } from '../../components/Wallpaper';
import { db } from '../../lib/firebase';
import { sendVoice } from '../../lib/media';
import { MAX_VOICE_SECONDS, useVoiceRecorder } from '../../lib/useVoiceRecorder';
import * as ImagePicker from 'expo-image-picker';
import { useLang } from '../../lib/i18n';
import type { IconName } from '../../lib/icons';
import { isOnline, presenceLabel } from '../../lib/presence';
import { canSeePresence, ticksOn } from '../../lib/profile';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';
import type { Chat, Message, ReplyRef, UserProfile } from '../../lib/types';

const QUICK = ['Zikomo', 'Ndafika!', 'Ok'];
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const TYPING_EVERY_MS = 4000;
const PREVIEW = (m: Message) =>
  m.type === 'image' ? (m.text ? `📷 ${m.text}` : '📷 Photo') : m.type === 'voice' ? '🎤 Voice note' : m.type === 'call' && m.call ? `📞 ${m.call.kind === 'video' ? 'Video' : 'Voice'} call` : m.text;

export default function Conversation() {
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const { user, profile } = useSession();
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<Chat | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState(draft ?? '');
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [menu, setMenu] = useState(false);
  const [wpOpen, setWpOpen] = useState(false);
  const { wallpaperFor } = usePrefs();
  const [other, setOther] = useState<UserProfile | null>(null);
  const [, setTick] = useState(0);
  const lastTyping = useRef(0);
  // With the keyboard up, the phone's bottom bar is hidden, so drop its padding.
  const [kbd, setKbd] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setKbd(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKbd(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const me = user?.uid ?? '';

  useEffect(() => (id ? subscribeChat(id, setChat) : undefined), [id]);
  useEffect(() => (id ? subscribeMessages(id, setMsgs) : undefined), [id]);

  // The other person's profile, for online / last seen in direct chats.
  const otherUid = chat?.type === 'direct' ? chat.members.find((m) => m !== me) : undefined;
  useEffect(() => {
    if (!otherUid) return;
    return onSnapshot(doc(db, 'users', otherUid), (s) => setOther(s.exists() ? ({ uid: s.id, ...s.data() } as UserProfile) : null));
  }, [otherUid]);

  // "typing…" and "online" go stale on their own, so re-check every few seconds.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (id && me && (chat?.unread?.[me] ?? 0) > 0) markRead(id, me).catch(() => {});
  }, [id, me, chat?.unread]);

  // Stop showing "typing…" to others when I leave the chat.
  useEffect(
    () => () => {
      if (id && me && lastTyping.current) setTyping(id, me, false).catch(() => {});
    },
    [id, me],
  );

  function onType(v: string) {
    setText(v);
    if (!id || !me || !v.trim()) return;
    const now = Date.now();
    if (now - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = now;
      setTyping(id, me, true).catch(() => {});
    }
  }

  async function send(body = text) {
    if (!chat || !body.trim()) return;
    const reply = replyTo;
    setText('');
    setReplyTo(null);
    lastTyping.current = 0;
    try {
      await sendMessage(chat, me, body, { replyTo: reply ?? undefined });
    } catch {
      setText(body);
      Alert.alert('Not sent', 'Check your connection and try again.');
    }
  }

  async function call(kind: 'voice' | 'video') {
    if (isGroup || !chat) return Alert.alert('Coming soon', 'Group calls are coming in a later update.');
    const otherId = chat.members.find((m) => m !== me);
    if (!otherId || !profile) return;
    try {
      const callId = await startCall(profile, { uid: otherId, name: chat.names[otherId] ?? 'EfuChat user' }, kind);
      router.push({ pathname: '/call/[id]', params: { id: callId } });
    } catch (e) {
      Alert.alert('Could not call', e instanceof Error && e.message.includes('call') ? e.message : 'Check your connection and try again.');
    }
  }

  // ---------- photos ----------
  async function pickPhotos(source: 'camera' | 'gallery') {
    if (!chat) return;
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', source === 'camera' ? 'Allow the camera to take photos.' : 'Allow photos to share them.');
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 4, quality: 0.8 });
    if (res.canceled || !res.assets.length) return;
    router.push({ pathname: '/send-photos', params: { chatId: chat.id, uris: JSON.stringify(res.assets.map((a) => a.uri)), to: title } });
  }

  // ---------- voice notes: hold the mic, slide left to cancel ----------
  const voice = useVoiceRecorder(() => stopVoice(true));
  const cancelled = useRef(false);
  const [slide, setSlide] = useState(0);
  async function stopVoice(keep: boolean) {
    const r = await voice.finish(keep && !cancelled.current);
    setSlide(0);
    if (!r || !chat) return;
    sendVoice(chat, me, r.uri, r.dur).catch((e) => Alert.alert('Voice note not sent', e instanceof Error ? e.message : 'Try again.'));
  }
  const micPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          cancelled.current = false;
          voice.start().catch(() => {});
        },
        onPanResponderMove: (_, g) => {
          setSlide(Math.min(0, g.dx));
          if (g.dx < -90) cancelled.current = true;
        },
        onPanResponderRelease: () => stopVoice(true),
        onPanResponderTerminate: () => stopVoice(false),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat, me],
  );

  function startReply(m: Message) {
    if (m.deleted) return;
    setReplyTo({ id: m.id, from: m.from, name: m.from === me ? 'You' : (chat?.names[m.from] ?? 'EfuChat user'), text: PREVIEW(m) });
    input.current?.focus();
  }

  const title = chat ? chatTitle(chat, me) : '';
  const others = chat?.members.filter((m) => m !== me) ?? [];
  const typing = whoIsTyping(chat, me);
  const isGroup = chat?.type === 'group';
  const amMember = !chat || chat.members.includes(me);
  const canSend = amMember && (!chat?.adminsOnly || isAdmin(chat, me));

  let sub: string;
  let subLive = false;
  if (typing.length) {
    sub = isGroup ? `${typing[0].split(' ')[0]} is typing…` : 'typing…';
    subLive = true;
  } else if (isGroup) {
    sub = `${chat?.members.length ?? 0} members`;
  } else {
    sub = canSeePresence(other, profile, true) ? presenceLabel(other) : 'EfuChat';
  }

  const readByAll = (m: Message) => (isGroup || ticksOn(other, profile)) && (others.every((o) => (chat?.unread?.[o] ?? 0) === 0) || (m.readBy?.length ?? 0) > others.length);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface100 }} behavior="padding">
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconButton name="back" label="Back to chats" onPress={() => router.back()} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isGroup ? 'Group info' : `${title}, ${sub}`}
            onPress={() => isGroup && router.push({ pathname: '/group/[id]', params: { id } })}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View>
              <Avatar name={title || '?'} size={40} rounded={12} uri={!isGroup ? other?.photoURL : undefined} />
              {!isGroup && canSeePresence(other, profile, true) && isOnline(other) && <View style={dot} />}
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 16 }} numberOfLines={1}>
                {title}
              </T>
              <T style={{ color: subLive ? colors.lime : colors.soft, fontSize: 12, fontFamily: subLive ? fonts.semibold : fonts.regular }} numberOfLines={1}>
                {sub}
              </T>
            </View>
          </Pressable>
          <IconButton name="video" label={isGroup ? 'Group video call (coming soon)' : 'Video call'} size={20} onPress={() => call('video')} />
          <IconButton name="phone" label={isGroup ? 'Group call (coming soon)' : 'Voice call'} size={20} onPress={() => call('voice')} />
          <IconButton name="more" label="More options" size={20} onPress={() => setMenu(true)} />
        </View>
      </Header>

      {chat?.pinned && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pinned message. Long press to unpin."
          onLongPress={() => pinMessage(chat.id, null).catch(() => {})}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 10, padding: 10, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line }}
        >
          <Icon name="pin" color={colors.lime600} size={18} />
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.lime600 }}>Pinned</T>
            <T style={{ fontSize: 13, color: colors.muted }} numberOfLines={1}>
              {chat.pinned.text}
            </T>
          </View>
        </Pressable>
      )}

      <View style={{ flex: 1 }}>
      <WallpaperFill name={wallpaperFor(chat?.id ?? id)} />
      <FlatList
        inverted
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        ListHeaderComponent={typing.length ? <TypingDots /> : undefined}
        renderItem={({ item, index }) => {
          const prev = msgs[index + 1];
          const showName = isGroup && item.from !== me && prev?.from !== item.from;
          if (item.type === 'call' && item.call && !item.deleted)
            return <CallLine msg={item} mine={item.from === me} onCallBack={() => call(item.call!.kind)} onLongPress={() => setSelected(item)} />;
          return (
            <Bubble
              chatId={chat?.id ?? ''}
              sender={item.from === me ? 'You' : (chat?.names[item.from] ?? 'EfuChat user')}
              msg={item}
              mine={item.from === me}
              read={readByAll(item)}
              name={showName ? (chat?.names[item.from] ?? 'EfuChat user') : undefined}
              me={me}
              onLongPress={() => !item.deleted && setSelected(item)}
              onReply={() => startReply(item)}
              onReact={(e) => chat && react(chat.id, item.id, me, item.reactions?.[me] === e ? null : e).catch(() => {})}
            />
          );
        }}
      />
      </View>

      {canSend ? (
        <>
          {!replyTo && (
            <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
              {QUICK.map((q) => (
                <Pressable key={q} accessibilityRole="button" accessibilityLabel={`Send ${q}`} onPress={() => send(q)} style={quick}>
                  <T style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.navy }}>{q}</T>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {replyTo && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 8, padding: 8, backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line }}>
              <Icon name="reply" color={colors.lime600} size={18} />
              <Quote reply={replyTo} mine={false} />
              <IconButton name="close" label="Cancel reply" color={colors.muted} size={18} onPress={() => setReplyTo(null)} />
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: (kbd ? 0 : insets.bottom) + 10 }}>
            <View
              style={{
                flex: 1,
                minHeight: 48,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 16,
                borderTopLeftRadius: replyTo ? 0 : 16,
                borderTopRightRadius: replyTo ? 0 : 16,
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: 14,
              }}
            >
              <TextInput
                ref={input}
                accessibilityLabel="Message"
                value={text}
                onChangeText={onType}
                placeholder={t('message')}
                placeholderTextColor="#8A93A8"
                multiline
                style={{ flex: 1, fontSize: 15, fontFamily: fonts.regular, color: colors.ink, maxHeight: 120, paddingVertical: 10 }}
              />
              {!text.trim() && <IconButton name="camera" label="Take a photo" color={colors.muted} onPress={() => pickPhotos('camera')} />}
              <IconButton
                name="plus"
                label="Share"
                color={colors.muted}
                onPress={() =>
                  Alert.alert('Share', undefined, [
                    { text: 'Photos from gallery', onPress: () => pickPhotos('gallery') },
                    { text: 'Take a photo', onPress: () => pickPhotos('camera') },
                    { text: 'Cancel', style: 'cancel' },
                  ])
                }
              />
            </View>
            {text.trim() ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={() => send()} style={micBtn}>
                <Icon name="send" color={colors.lime} />
              </Pressable>
            ) : (
              <View
                accessibilityRole="button"
                accessibilityLabel="Hold to record a voice note"
                {...micPan.panHandlers}
                style={[micBtn, voice.recording && { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.danger }]}
              >
                <Icon name="mic" color={voice.recording ? '#FFFFFF' : colors.lime} size={voice.recording ? 28 : 22} />
              </View>
            )}
          </View>
          {voice.recording && (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: 8, right: 76, bottom: (kbd ? 0 : insets.bottom) + 10, height: 48, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />
              <T style={{ fontFamily: fonts.extrabold, width: 42 }}>{`${Math.floor(voice.secs / 60)}:${String(Math.floor(voice.secs % 60)).padStart(2, '0')}`}</T>
              <T style={{ flex: 1, textAlign: 'center', color: slide < -90 ? colors.danger : colors.muted, fontFamily: fonts.semibold, transform: [{ translateX: Math.max(slide, -60) }] }}>
                {slide < -90 ? 'Release to cancel' : '‹ Slide to cancel'}
              </T>
              <T style={{ fontSize: 12, color: colors.muted }}>{`max ${MAX_VOICE_SECONDS / 60}:00`}</T>
            </View>
          )}
        </>
      ) : (
        <View style={{ padding: 16, paddingBottom: insets.bottom + 16, alignItems: 'center', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: colors.line }}>
          <T style={{ color: colors.muted, fontSize: 14, textAlign: 'center' }}>
            {amMember ? 'Only admins can send messages in this group.' : 'You are no longer in this group.'}
          </T>
        </View>
      )}

      {selected && chat && (
        <Actions
          msg={selected}
          mine={selected.from === me}
          myReaction={selected.reactions?.[me]}
          onClose={() => setSelected(null)}
          onReact={(e) => react(chat.id, selected.id, me, selected.reactions?.[me] === e ? null : e).catch(() => {})}
          onReply={() => startReply(selected)}
          onCopy={() => Clipboard.setStringAsync(selected.text)}
          onForward={() => router.push({ pathname: '/forward', params: { text: selected.text } })}
          onPin={() => pinMessage(chat.id, chat.pinned?.id === selected.id ? null : { ...selected, text: PREVIEW(selected) }).catch(() => Alert.alert('Could not pin', 'Try again.'))}
          pinned={chat.pinned?.id === selected.id}
          onDelete={() =>
            Alert.alert('Delete for everyone?', 'The message will be removed for everyone in this chat.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => deleteForEveryone(chat, selected, msgs[0]?.id === selected.id).catch(() => Alert.alert('Could not delete', 'Try again.')),
              },
            ])
          }
        />
      )}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setMenu(false)} accessibilityLabel="Close menu">
          <View style={{ position: 'absolute', top: insets.top + 56, right: 10, backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 6, minWidth: 190, elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12 }}>
            {[
              ...(isGroup ? [{ icon: 'group' as IconName, label: 'Group info', go: () => router.push({ pathname: '/group/[id]', params: { id } }) }] : []),
              { icon: 'palette' as IconName, label: 'Wallpaper', go: () => setWpOpen(true) },
            ].map((o) => (
              <Pressable key={o.label} accessibilityRole="menuitem" onPress={() => { setMenu(false); o.go(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Icon name={o.icon} color={colors.navy} size={20} />
                <T style={{ fontFamily: fonts.semibold }}>{o.label}</T>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      <WallpaperPicker visible={wpOpen} chatId={chat?.id ?? id} onClose={() => setWpOpen(false)} />
    </KeyboardAvoidingView>
  );
}

function Ticks({ read }: { read: boolean }) {
  const c = read ? colors.lime600 : colors.muted;
  return (
    <View style={{ flexDirection: 'row' }} accessibilityLabel={read ? 'Read' : 'Sent'}>
      <Icon name="check" color={c} size={14} />
      <View style={{ marginLeft: -8 }}>
        <Icon name="check" color={c} size={14} />
      </View>
    </View>
  );
}

function Quote({ reply, mine }: { reply: ReplyRef; mine: boolean }) {
  return (
    <View style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: mine ? colors.lime600 : colors.navy, backgroundColor: mine ? '#DCEFAE' : colors.surface100, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 }}>
      <T style={{ fontSize: 12, fontFamily: fonts.bold, color: mine ? colors.lime600 : colors.navy }}>{reply.name}</T>
      <T style={{ fontSize: 13, color: colors.muted }} numberOfLines={2}>
        {reply.text}
      </T>
    </View>
  );
}

function Bubble({
  chatId,
  sender,
  msg,
  mine,
  read,
  name,
  me,
  onLongPress,
  onReply,
  onReact,
}: {
  chatId: string;
  sender: string;
  msg: Message;
  mine: boolean;
  read: boolean;
  name?: string;
  me: string;
  onLongPress: () => void;
  onReply: () => void;
  onReact: (e: string) => void;
}) {
  const time = msg.createdAt ? msg.createdAt.toDate().toTimeString().slice(0, 5) : '…';
  const dx = useRef(new Animated.Value(0)).current;
  const replyRef = useRef(onReply);
  replyRef.current = onReply;

  // Swipe right to reply. Only claims clearly horizontal drags so the list still scrolls.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderMove: (_, g) => dx.setValue(Math.max(0, Math.min(g.dx, 80))),
        onPanResponderRelease: (_, g) => {
          if (g.dx > 60) replyRef.current();
          Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => Animated.spring(dx, { toValue: 0, useNativeDriver: true }).start(),
      }),
    [dx],
  );

  const counts = new Map<string, number>();
  for (const e of Object.values(msg.reactions ?? {})) counts.set(e, (counts.get(e) ?? 0) + 1);
  const reactions = [...counts.entries()];

  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', marginBottom: reactions.length ? 14 : 0 }}>
      <Animated.View
        style={{ position: 'absolute', left: -34, top: '30%', opacity: dx.interpolate({ inputRange: [0, 60], outputRange: [0, 1] }), transform: [{ translateX: dx }] }}
      >
        <Icon name="reply" color={colors.lime600} size={20} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: dx }] }} {...pan.panHandlers}>
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={300}
          accessibilityHint="Long press for reactions, reply, copy, forward, pin or delete"
          style={{
            backgroundColor: mine ? colors.lime100 : '#FFFFFF',
            borderWidth: 1,
            borderColor: mine ? '#D5EBA0' : colors.line,
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 6,
            borderRadius: 16,
            borderTopRightRadius: mine ? 4 : 16,
            borderTopLeftRadius: mine ? 16 : 4,
            gap: 4,
          }}
        >
          {name && <T style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.lime600 }}>{name}</T>}
          {msg.forwarded && !msg.deleted && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="forward" color={colors.muted} size={13} />
              <T style={{ fontSize: 12, color: colors.muted, fontStyle: 'italic' }}>Forwarded</T>
            </View>
          )}
          {msg.replyTo && !msg.deleted && <Quote reply={{ ...msg.replyTo, name: msg.replyTo.from === me ? 'You' : msg.replyTo.name }} mine={mine} />}
          {msg.deleted ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="block" color={colors.muted} size={14} />
              <T style={{ fontStyle: 'italic', color: colors.muted }}>This message was deleted</T>
            </View>
          ) : (
            <>
              {msg.media?.kind === 'image' && <PhotoContent chatId={chatId} media={msg.media} caption={msg.text} from={sender} time={time} onLongPress={onLongPress} />}
              {msg.media?.kind === 'voice' && <VoiceContent chatId={chatId} media={msg.media} mine={mine} />}
              {!!msg.text && <T style={{ lineHeight: 21 }}>{msg.text}</T>}
            </>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' }}>
            <T style={{ fontSize: 11, color: colors.muted }}>{time}</T>
            {mine && !msg.deleted && <Ticks read={read} />}
          </View>
        </Pressable>
      </Animated.View>
      {reactions.length > 0 && (
        <View style={{ position: 'absolute', bottom: -14, [mine ? 'left' : 'right']: 10, flexDirection: 'row', gap: 4 }}>
          {reactions.map(([e, n]) => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`${e} ${n}`}
              onPress={() => onReact(e)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: msg.reactions?.[me] === e ? colors.lime100 : '#FFFFFF', borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}
            >
              <Text style={{ fontSize: 13 }}>{e}</Text>
              {n > 1 && <T style={{ fontSize: 12, fontFamily: fonts.bold }}>{n}</T>}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function TypingDots() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(a, { toValue: 3, duration: 900, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View accessibilityLabel="typing" style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 5, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted, opacity: a.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [0.3, i === 0 ? 1 : 0.3, i === 1 ? 1 : 0.3, i === 2 ? 1 : 0.3] }) }}
        />
      ))}
    </View>
  );
}

function Actions({
  msg,
  mine,
  myReaction,
  pinned,
  onClose,
  onReact,
  onReply,
  onCopy,
  onForward,
  onPin,
  onDelete,
}: {
  msg: Message;
  mine: boolean;
  myReaction?: string;
  pinned: boolean;
  onClose: () => void;
  onReact: (e: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const items: { icon: IconName; label: string; run: () => void; danger?: boolean }[] = [
    { icon: 'reply', label: 'Reply', run: onReply },
    ...(msg.text ? [{ icon: 'copy' as IconName, label: 'Copy', run: onCopy }] : []),
    ...(!msg.media ? [{ icon: 'forward' as IconName, label: 'Forward', run: onForward }] : []),
    { icon: 'pin', label: pinned ? 'Unpin' : 'Pin', run: onPin },
    ...(mine ? [{ icon: 'trash' as IconName, label: 'Delete for everyone', run: onDelete, danger: true }] : []),
  ];
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(10,34,83,0.45)', justifyContent: 'center', padding: 16, gap: 10 }}>
        <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', flexDirection: 'row', gap: 2, backgroundColor: '#FFFFFF', borderRadius: 999, padding: 6 }}>
          {EMOJIS.map((e) => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`React ${e}`}
              onPress={() => {
                onReact(e);
                onClose();
              }}
              style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: myReaction === e ? colors.lime100 : 'transparent' }}
            >
              <Text style={{ fontSize: 26 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: mine ? colors.lime100 : '#FFFFFF', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
          <T numberOfLines={4}>{PREVIEW(msg)}</T>
        </View>
        <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', width: 240, backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' }}>
          {items.map((it, i) => (
            <Pressable
              key={it.label}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                it.run();
              }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: colors.surface100, backgroundColor: pressed ? colors.surface100 : '#FFFFFF' })}
            >
              <Icon name={it.icon} color={it.danger ? colors.danger : colors.navy} size={20} />
              <T style={{ fontFamily: fonts.semibold, color: it.danger ? colors.danger : colors.ink }}>{it.label}</T>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const dot = { position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#3BD16F', borderWidth: 2, borderColor: colors.navy } as const;
const micBtn = { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' } as const;
const quick = { height: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF', justifyContent: 'center' } as const;

function fmtDur(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** A call shown in the chat: answered, missed (red + Call back for the person who missed it) or no answer. */
function CallLine({ msg, mine, onCallBack, onLongPress }: { msg: Message; mine: boolean; onCallBack: () => void; onLongPress: () => void }) {
  const c = msg.call!;
  const time = msg.createdAt ? msg.createdAt.toDate().toTimeString().slice(0, 5) : '…';
  const answered = c.outcome === 'answered';
  const missedForMe = !answered && !mine;
  const title = callLabel(c.kind, c.outcome, mine);
  const detail = answered ? `${time} · ${fmtDur(c.dur ?? 0)}` : mine ? `${time} · ${c.outcome === 'declined' ? 'Declined' : c.outcome === 'cancelled' ? 'Cancelled' : 'No answer'}` : time;
  const tint = missedForMe ? colors.danger : colors.navy;
  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={300}
      accessibilityLabel={`${title}, ${detail}`}
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minWidth: 210,
        maxWidth: '80%',
        padding: 10,
        borderRadius: 16,
        borderTopRightRadius: mine ? 4 : 16,
        borderTopLeftRadius: mine ? 16 : 4,
        backgroundColor: mine ? colors.lime100 : '#FFFFFF',
        borderWidth: 1,
        borderColor: missedForMe ? '#F5C2BD' : mine ? '#D5EBA0' : colors.line,
      }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: missedForMe ? colors.dangerTint : mine ? '#FFFFFF' : colors.surface100 }}>
        <Icon name={c.kind === 'video' ? 'video' : mine ? 'callout' : 'callin'} color={tint} size={19} />
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: fonts.bold, color: missedForMe ? colors.danger : colors.navy }}>{title}</T>
        <T style={{ fontSize: 12, color: colors.muted }}>{detail}</T>
      </View>
      {missedForMe && (
        <Pressable accessibilityRole="button" accessibilityLabel="Call back" onPress={onCallBack} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.navy }}>
          <T style={{ color: '#FFFFFF', fontSize: 12, fontFamily: fonts.bold }}>Call back</T>
        </Pressable>
      )}
    </Pressable>
  );
}
