import { doc, getDoc } from '@react-native-firebase/firestore';
import { getAuth } from '@react-native-firebase/auth';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dialog } from '../components/Dialog';
import { Avatar, Button, Header, Icon, ScaledTextInput, T } from '../components/ui';
import { openDirectChat, subscribeChats, chatTitle } from '../lib/chats';
import { db } from '../lib/firebase';
import { checkPayment, getPayout, localNumber, mk, OPERATOR_NAME, operatorOf, postMoneyMessage, startPayment, type PayStatus } from '../lib/money';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';
import type { Chat } from '../lib/types';

const QUICK = [2000, 5000, 10000, 20000];

/** Send money to someone: amount, pay from your Airtel Money / TNM Mpamba, approve with your PIN. */
export default function SendMoney() {
  const params = useLocalSearchParams<{ uid?: string; name?: string; chatId?: string }>();
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [to, setTo] = useState<{ uid: string; name: string; chatId?: string } | null>(params.uid ? { uid: params.uid, name: params.name ?? 'EfuChat user', chatId: params.chatId } : null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('');
  const [note, setNote] = useState('');
  const [stage, setStage] = useState<'form' | 'waiting' | 'done' | 'failed'>('form');
  const [status, setStatus] = useState<PayStatus>('charging');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const me = profile?.uid ?? '';

  // Pick a person from my direct chats when opened from the Create menu.
  useEffect(() => (me && !to ? subscribeChats(me, (c) => setChats(c.filter((x) => x.type !== 'group'))) : undefined), [me, to]);
  // Default "pay from": my own receiving number, else my sign-in number if it's Malawian.
  useEffect(() => {
    if (!me) return;
    getPayout(me).then((p) => {
      if (p?.mobile) return setFrom(p.mobile);
      const phone = getAuth().currentUser?.phoneNumber ?? '';
      if (phone.startsWith('+265')) setFrom(localNumber(phone));
    }, () => {});
  }, [me]);
  useEffect(() => () => {
    if (poll.current) clearInterval(poll.current);
  }, []);

  const value = Number(amount.replace(/\D/g, '')) || 0;
  const op = operatorOf(from);

  async function send() {
    if (!profile || !to) return;
    if (value < 100) return setError('Enter at least MK 100.');
    if (!op) return setError('Pay from an Airtel Money (099…) or TNM Mpamba (088…) number.');
    setError('');
    setBusy(true);
    try {
      const r = await startPayment({ to: to.uid, amount: value, fromMobile: from, note, chatId: to.chatId });
      setStage('waiting');
      setStatus(r.status);
      let tries = 0;
      poll.current = setInterval(async () => {
        tries++;
        try {
          const s = await checkPayment(r.id);
          setStatus(s.status);
          if (s.status === 'paid' || s.status === 'paying') {
            if (poll.current) clearInterval(poll.current);
            await announce(r.id);
            setStage('done');
          } else if (s.status === 'failed' || s.status === 'payout_failed') {
            if (poll.current) clearInterval(poll.current);
            setStage('failed');
          }
        } catch {}
        if (tries > 60 && poll.current) {
          clearInterval(poll.current);
          setStage('failed');
        }
      }, 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment service is not available right now.');
    } finally {
      setBusy(false);
    }
  }

  async function announce(id: string) {
    if (!profile || !to) return;
    try {
      const chatId = to.chatId ?? (await openDirectChat(profile, to));
      const snap = await getDoc(doc(db, 'chats', chatId));
      if (snap.exists()) await postMoneyMessage({ id: snap.id, ...snap.data() } as Chat, profile.uid, { id, amount: value, note });
    } catch {}
  }

  if (!to) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
        <Header title="Send money" subtitle="Who are you sending to?" onBack={() => router.back()} />
        <ScrollView contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: insets.bottom + 20 }}>
          {!chats.length && <T style={{ color: colors.muted, padding: 12 }}>Start a chat with someone first, then send them money from here or from the chat.</T>}
          {chats.map((c) => {
            const uid = c.members.find((m) => m !== me) ?? '';
            const name = chatTitle(c, me);
            return (
              <Pressable key={c.id} accessibilityRole="button" onPress={() => setTo({ uid, name, chatId: c.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#FFFFFF', borderRadius: 16 }}>
                <Avatar name={name} size={48} rounded={999} />
                <T style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16 }} numberOfLines={1}>{name}</T>
                <Icon name="chev" color={colors.muted} size={18} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  if (stage !== 'form') {
    const waiting = stage === 'waiting';
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
        <Header title="Send money" subtitle={`To ${to.name}`} onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
          {waiting ? (
            <ActivityIndicator size="large" color={colors.navy} />
          ) : (
            <View style={{ width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: stage === 'done' ? colors.lime : colors.dangerTint }}>
              <Icon name={stage === 'done' ? 'check' : 'close'} color={stage === 'done' ? colors.navy : colors.danger} size={40} />
            </View>
          )}
          <T style={{ fontFamily: fonts.extrabold, fontSize: 28 }}>{mk(value)}</T>
          <T style={{ fontFamily: fonts.bold, fontSize: 17, textAlign: 'center' }}>
            {waiting
              ? status === 'paying'
                ? `Sending to ${to.name}…`
                : `Check your phone: enter your ${op ? OPERATOR_NAME[op] : 'mobile money'} PIN to approve`
              : stage === 'done'
                ? `Sent to ${to.name}`
                : status === 'payout_failed'
                  ? `Your payment went through but sending it to ${to.name} failed. EfuChat support will fix it.`
                  : 'The payment did not go through. No money was taken.'}
          </T>
          {waiting && <T style={{ color: colors.muted, textAlign: 'center' }}>Keep this screen open. It updates by itself.</T>}
          {!waiting && <Button title={stage === 'done' ? 'Done' : 'Close'} onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 10 }} />}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header title="Send money" subtitle={`To ${to.name}`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12 }}>
          <Avatar name={to.name} size={48} rounded={999} />
          <T style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16 }}>{to.name}</T>
        </View>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, alignItems: 'center', gap: 10 }}>
          <T style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.muted }}>AMOUNT</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T style={{ fontSize: 30, fontFamily: fonts.extrabold }}>MK</T>
            <ScaledTextInput
              accessibilityLabel="Amount in kwacha"
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/\D/g, '').slice(0, 7))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.line}
              style={{ fontSize: 30, fontFamily: fonts.extrabold, minWidth: 120, textAlign: 'center' }}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {QUICK.map((q) => (
              <Pressable key={q} accessibilityRole="button" onPress={() => setAmount(String(q))} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: value === q ? colors.navy : colors.surface100 }}>
                <T style={{ fontFamily: fonts.bold, color: value === q ? '#FFFFFF' : colors.ink }}>{q.toLocaleString('en-US')}</T>
              </Pressable>
            ))}
          </View>
        </View>
        <T style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.muted }}>PAY FROM</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 14, minHeight: 56, borderWidth: 1, borderColor: colors.line }}>
          <Icon name="wallet" color={op === 'airtel' ? colors.danger : colors.lime600} size={22} />
          <ScaledTextInput
            accessibilityLabel="Your mobile money number"
            value={from}
            onChangeText={setFrom}
            keyboardType="phone-pad"
            placeholder="099… or 088…"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, fontSize: 17 }}
          />
          <T style={{ fontSize: 13, fontFamily: fonts.bold, color: op ? colors.navy : colors.muted }}>{op ? OPERATOR_NAME[op] : ''}</T>
        </View>
        <ScaledTextInput
          accessibilityLabel="What it's for (optional)"
          value={note}
          onChangeText={setNote}
          maxLength={120}
          placeholder="What it's for (optional), e.g. Transport"
          placeholderTextColor={colors.muted}
          style={{ minHeight: 52, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontSize: 15 }}
        />
        {!!error && <T style={{ color: colors.danger }}>{error}</T>}
        <T style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>You'll get a prompt on your phone to enter your PIN. {to.name.split(' ')[0]} receives it on their mobile money.</T>
        <Button title={busy ? 'Starting…' : value ? `Send ${mk(value)}` : 'Send'} icon="send" loading={busy} disabled={!value} onPress={send} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
