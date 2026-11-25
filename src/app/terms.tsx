import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, Icon, T } from '../components/ui';
import { colors, fonts } from '../lib/theme';

/**
 * Terms of use and privacy policy. Written in plain words for EfuChat as it works today.
 * It deliberately names no technology providers. Have it checked by a lawyer before launch.
 */
const UPDATED = '25 November 2026';

type Section = { title: string; body: string };

const PRIVACY: Section[] = [
  { title: 'What we collect', body: 'Your phone number, and the name, photo, username, about line and town you add to your profile. The messages, photos, voice notes, videos, documents, locations and contacts you send. Who you call, when, and for how long. A notification token so your phone can ring and show new messages.' },
  { title: 'Your phone contacts', body: 'When you allow it, EfuChat checks which numbers in your phone book use EfuChat so you can find friends. We do not keep a copy of your phone book.' },
  { title: 'Messages and files', body: 'Your chats are stored on secure cloud servers so they reach every phone you sign in on. Only the people in a chat can open its messages and files. Messages are protected while they travel, but they are not end-to-end encrypted yet.' },
  { title: 'Calls', body: 'Voice and video calls travel through a calling service. Calls are never recorded. Missed and answered calls appear in your chat and in your call history.' },
  { title: 'Location', body: 'EfuChat only reads your location when you choose to share it in a chat. It is not tracked in the background.' },
  { title: 'Who can see what', body: 'You choose who can see your last seen, profile photo and read ticks, and who can call you, in Me → Privacy and security. Posts, stories and Market listings are seen by the people you share them with; Market listings are public to all EfuChat users.' },
  { title: 'Money', body: 'When you send money or pay for an order, the payment goes straight from your mobile money account through a licensed payment partner. EfuChat does not hold a balance for you and does not see your mobile money PIN.' },
  { title: 'How long we keep it', body: 'We keep your account and chats until you delete them. Stories disappear after 24 hours. Deleted messages are removed for everyone. When you ask us to delete your account, your profile and messages are removed within 30 days.' },
  { title: 'We never sell your data', body: 'We do not sell your information or use your messages for advertising. We only share information when the law requires it, or with the service partners that run EfuChat for us, who must keep it safe.' },
];

const TERMS: Section[] = [
  { title: 'Who can use EfuChat', body: 'You must be at least 16 years old and use your own phone number. Keep your phone and sign-in code safe; you are responsible for what is sent from your account.' },
  { title: 'Be respectful', body: 'Do not use EfuChat to bully, threaten, harass or scam anyone, to share sexual content involving children, to spread hate, or to break the law. Do not send spam or pretend to be someone else.' },
  { title: 'Market', body: 'Sales in Market are between the buyer and the seller. Describe items honestly, use real photos and only sell what you own and are allowed to sell. EfuChat is not part of the sale, but we will remove fake listings and block scammers.' },
  { title: 'Blocking, reporting and suspension', body: 'You can block or report anyone. We review reports and may remove content or suspend accounts that break these terms.' },
  { title: 'Your content', body: 'What you post stays yours. You give EfuChat permission to store and deliver it to the people you share it with, only so the app can work.' },
  { title: 'The service', body: 'We work hard to keep EfuChat running, but it is provided as it is and may sometimes be unavailable. We are not responsible for losses caused by things outside our control.' },
  { title: 'Changes', body: 'We may update these terms. When we make important changes we will tell you in the app before they apply.' },
];

const RIGHTS: Section[] = [
  { title: 'See and correct your data', body: 'Your profile is always visible and editable in Me → Edit profile.' },
  { title: 'Get a copy', body: 'Ask EfuChat support in Me → Help and we will send you a copy of your information.' },
  { title: 'Delete', body: 'Delete any message for everyone, leave any group, or ask support to delete your whole account.' },
  { title: 'Sign out everywhere', body: 'Use Me → Privacy and security → Sign out of all phones if you lose your phone.' },
  { title: 'Your laws', body: "We follow Malawi's Data Protection Act 2024 and South Africa's Protection of Personal Information Act (POPIA). You can complain to the data protection authority in your country." },
  { title: 'Contact us', body: 'Chat with EfuChat support any time from Me → Help. EfuChat is made by EfuLogistix and Technologies, Mangochi, Malawi.' },
];

const TABS = [
  { id: 'privacy', label: 'Privacy', items: PRIVACY },
  { id: 'terms', label: 'Terms of use', items: TERMS },
  { id: 'rights', label: 'Your rights', items: RIGHTS },
] as const;

export default function Terms() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('privacy');
  const items = TABS.find((t) => t.id === tab)!.items;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header title="Terms and privacy" subtitle={`Updated ${UPDATED}`} onBack={() => router.back()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <Pressable
              key={t.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setTab(t.id)}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, backgroundColor: on ? colors.navy : '#FFFFFF', borderWidth: on ? 0 : 1, borderColor: colors.line }}
            >
              <T style={{ fontFamily: fonts.bold, color: on ? '#FFFFFF' : colors.ink }}>{t.label}</T>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: insets.bottom + 24 }}>
        {tab === 'privacy' && (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: colors.lime100 }}>
            <Icon name="shield" color={colors.lime600} size={24} />
            <T style={{ flex: 1, lineHeight: 21 }}>
              <T style={{ fontFamily: fonts.bold }}>In short: </T>
              we use your number to sign you in, your contacts only to find friends, and we never sell your data.
            </T>
          </View>
        )}
        {items.map((s) => (
          <View key={s.title} style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 6 }}>
            <T style={{ fontFamily: fonts.extrabold, fontSize: 16 }}>{s.title}</T>
            <T style={{ color: colors.muted, lineHeight: 22 }}>{s.body}</T>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
