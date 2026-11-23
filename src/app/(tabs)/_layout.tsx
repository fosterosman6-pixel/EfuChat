import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '../../components/TabBar';
import { useSession } from '../../lib/session';
import { colors } from '../../lib/theme';

export default function TabsLayout() {
  const { user, profile } = useSession();
  if (user === null) return <Redirect href="/welcome" />;
  if (user && profile === null) return <Redirect href="/profile-setup" />;

  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.surface100 } }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="reels" />
      <Tabs.Screen name="plus" />
      <Tabs.Screen name="market" />
      <Tabs.Screen name="chats" />
    </Tabs>
  );
}
