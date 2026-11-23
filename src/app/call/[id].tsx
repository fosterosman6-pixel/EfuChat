import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Linking, Pressable, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, T } from '../../components/ui';
import { RtcSurfaceView } from 'react-native-agora';
import { AGORA_APP_ID, cameraPermission, flipCamera, joinVoice, micPermission, setCamera, setMuted, setSpeaker } from '../../lib/agora';
import { logCallInChat, RING_MS, setCallStatus, subscribeCall, type Call } from '../../lib/calls';
import type { IconName } from '../../lib/icons';
import { useSession } from '../../lib/session';
import { colors, fonts, initialsOf } from '../../lib/theme';

const ENDED: Record<string, string> = { declined: 'Call declined', missed: 'No answer', cancelled: 'Call cancelled', ended: 'Call ended' };

export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useSession();
  const insets = useSafeAreaInsets();
  const [call, setCall] = useState<Call | null>(null);
  const [connected, setConnected] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [speaker, setSpeakerState] = useState(false);
  const [secs, setSecs] = useState(0);
  const [voiceOnly, setVoiceOnly] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [remoteVideo, setRemoteVideo] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const pulse = useRef(new Animated.Value(0)).current;
  const me = user?.uid ?? '';
  const outgoing = call?.from === me;
  const status = call?.status;
  const isVideo = call?.kind === 'video' && !voiceOnly;

  useEffect(() => (id ? subscribeCall(id, setCall) : undefined), [id]);

  // Ringing pulse around the avatar.
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Incoming: vibrate while ringing. Outgoing: give up after RING_MS.
  useEffect(() => {
    if (status !== 'ringing' || !call) return;
    if (!outgoing) {
      Vibration.vibrate([0, 800, 800], true);
      return () => Vibration.cancel();
    }
    const left = RING_MS - (call.createdAt ? Date.now() - call.createdAt.toDate().getTime() : 0);
    const timer = setTimeout(() => setCallStatus(call.id, 'missed').catch(() => {}), Math.max(left, 1000));
    return () => clearTimeout(timer);
  }, [status, outgoing, call]);

  // Both sides join the Agora channel once the call is accepted.
  useEffect(() => {
    if (status !== 'accepted' || !id) return;
    let leave: (() => void) | undefined;
    let alive = true;
    (async () => {
      if (!(await micPermission())) {
        Alert.alert('Microphone needed', 'Allow the microphone in settings to make calls.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => Linking.openSettings() },
        ]);
        setCallStatus(id, 'ended').catch(() => {});
        return;
      }
      if (isVideo && !(await cameraPermission())) {
        Alert.alert('Camera off', 'Allow the camera in settings for video. Carrying on with voice.');
        setVoiceOnly(true);
        return;
      }
      if (!alive) return;
      try {
        const stop = await joinVoice(
          id,
          {
            onUserJoined: (_c, uid) => {
              setRemoteUid(uid);
              setConnected(true);
            },
            onRemoteVideoStateChanged: (_c, _uid, state) => setRemoteVideo(state === 1 || state === 2),
            onUserOffline: () => setCallStatus(id, 'ended').catch(() => {}),
            onError: (_e, msg) => console.warn('Agora', msg),
          },
          isVideo,
        );
        if (isVideo) setSpeakerState(true);
        if (alive) leave = stop;
        else stop();
      } catch (e) {
        Alert.alert('Call could not connect', e instanceof Error ? e.message : 'Try again.');
        setCallStatus(id, 'ended').catch(() => {});
      }
    })();
    return () => {
      alive = false;
      leave?.();
      setConnected(false);
      setRemoteUid(null);
      setRemoteVideo(false);
    };
  }, [status, id, isVideo]);

  // Call timer.
  useEffect(() => {
    if (!connected) return;
    const start = Date.now();
    const timer = setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [connected]);

  // The caller leaves a line in the chat once the call is over.
  const logged = useRef(false);
  useEffect(() => {
    if (!call || !outgoing || logged.current || !status || status === 'ringing' || status === 'accepted') return;
    if (status === 'ended' && !call.endedAt) return; // wait for the server time so the length is right
    logged.current = true;
    if (profile) logCallInChat(call, profile).catch(() => {});
  }, [call, outgoing, status, profile]);

  // Close the screen shortly after the call finishes.
  useEffect(() => {
    if (!status || status === 'ringing' || status === 'accepted') return;
    const timer = setTimeout(() => router.canGoBack() && router.back(), 1500);
    return () => clearTimeout(timer);
  }, [status]);

  // Leaving the screen mid-call ends it for both people.
  const statusRef = useRef(status);
  statusRef.current = status;
  useEffect(
    () => () => {
      if (!id) return;
      if (statusRef.current === 'accepted') setCallStatus(id, 'ended').catch(() => {});
      if (statusRef.current === 'ringing') setCallStatus(id, outgoing ? 'cancelled' : 'declined').catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, outgoing],
  );

  useEffect(() => {
    if (!AGORA_APP_ID && call) Alert.alert('Calls are not set up yet', 'The calling service still needs its App ID.');
  }, [call]);

  function hangUp() {
    if (!call) return router.back();
    const next = status === 'ringing' ? (outgoing ? 'cancelled' : 'declined') : 'ended';
    setCallStatus(call.id, next).catch(() => router.back());
  }

  const name = call ? (outgoing ? call.toName : call.fromName) : '';
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const label = !call
    ? 'Connecting…'
    : status === 'ringing'
      ? outgoing ? 'Ringing…' : call.kind === 'video' ? 'Incoming video call' : 'Incoming voice call'
      : status === 'accepted'
        ? connected ? mmss : 'Connecting…'
        : ENDED[status ?? 'ended'];
  const ringing = status === 'ringing';

  if (status === 'accepted' && isVideo) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.navy }}>
        {remoteUid !== null && remoteVideo ? (
          <RtcSurfaceView canvas={{ uid: remoteUid }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        ) : (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <T style={{ fontSize: 40, fontFamily: fonts.extrabold, color: '#FFFFFF' }}>{initialsOf(name || '?')}</T>
            </View>
            <T style={{ color: colors.soft }}>{connected ? 'Camera is off' : 'Connecting…'}</T>
          </View>
        )}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
          <T style={{ color: '#FFFFFF', fontSize: 18, fontFamily: fonts.extrabold }}>{name}</T>
          <T style={{ color: colors.lime, fontSize: 13, fontFamily: fonts.bold }}>{connected ? `${mmss} · Low-data video` : 'Connecting…'}</T>
        </View>
        {cameraOn && (
          <View style={{ position: 'absolute', top: insets.top + 70, right: 14, width: 104, height: 150, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', backgroundColor: colors.navy700 }}>
            <RtcSurfaceView canvas={{ uid: 0 }} zOrderMediaOverlay style={{ flex: 1 }} />
          </View>
        )}
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 20, paddingVertical: 14, borderRadius: 26, backgroundColor: 'rgba(10,34,83,0.78)', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
          <Small icon="flip" label="Flip" on={false} onPress={() => flipCamera()} />
          <Small
            icon="videooff"
            label="Camera"
            on={!cameraOn}
            onPress={() => {
              setCamera(!cameraOn);
              setCameraOn(!cameraOn);
            }}
          />
          <Small
            icon="micoff"
            label="Mute"
            on={muted}
            onPress={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
          />
          <Small
            icon="speaker"
            label="Speaker"
            on={speaker}
            onPress={() => {
              setSpeaker(!speaker);
              setSpeakerState(!speaker);
            }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="End call" onPress={hangUp} style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="hangup" color="#FFFFFF" size={28} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.navy, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44 }}>
        <Icon name={call?.kind === 'video' ? 'video' : 'phone'} color={colors.soft} size={14} />
        <T style={{ color: colors.soft, fontSize: 13 }}>{call?.kind === 'video' ? 'EfuChat video call' : 'EfuChat voice call'}</T>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <View style={{ width: 190, height: 190, alignItems: 'center', justifyContent: 'center' }}>
          {(ringing || (status === 'accepted' && !connected)) && (
            <Animated.View
              style={{
                position: 'absolute',
                width: 190,
                height: 190,
                borderRadius: 95,
                borderWidth: 2,
                borderColor: colors.lime,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.1] }) }],
              }}
            />
          )}
          <View style={{ width: 150, height: 150, borderRadius: 75, borderWidth: 3, borderColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
              <T style={{ fontSize: 46, fontFamily: fonts.extrabold, color: colors.navy }}>{initialsOf(name || '?')}</T>
            </View>
          </View>
        </View>
        <T style={{ color: '#FFFFFF', fontSize: 26, fontFamily: fonts.extrabold, textAlign: 'center', paddingHorizontal: 24 }}>{name}</T>
        <T style={{ color: status === 'accepted' && connected ? colors.lime : colors.soft, fontSize: 17, fontFamily: fonts.bold }}>{label}</T>
        {ringing && !outgoing && call?.kind === 'video' && <T style={{ color: colors.soft, fontSize: 12 }}>Uses about 4–6 MB a minute · Wi-Fi recommended</T>}
        {status === 'accepted' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="data" color={colors.soft} size={14} />
            <T style={{ color: colors.soft, fontSize: 13 }}>Low-data call</T>
          </View>
        )}
      </View>

      {ringing && !outgoing ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 32 }}>
          <Round icon="hangup" label="Decline" bg={colors.danger} onPress={hangUp} />
          {call?.kind === 'video' && (
            <Round
              icon="phone"
              label="Voice only"
              bg={colors.navy700}
              onPress={() => {
                setVoiceOnly(true);
                if (call) setCallStatus(call.id, 'accepted').catch(() => {});
              }}
            />
          )}
          <Round icon={call?.kind === 'video' ? 'video' : 'phone'} label="Accept" bg="#1F9D55" onPress={() => call && setCallStatus(call.id, 'accepted').catch(() => {})} />
        </View>
      ) : (
        <View style={{ gap: 28 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 24 }}>
            <Toggle
              icon="speaker"
              label="Speaker"
              on={speaker}
              disabled={status !== 'accepted'}
              onPress={() => {
                setSpeaker(!speaker);
                setSpeakerState(!speaker);
              }}
            />

            <Toggle
              icon="micoff"
              label="Mute"
              on={muted}
              disabled={status !== 'accepted'}
              onPress={() => {
                setMuted(!muted);
                setMutedState(!muted);
              }}
            />
          </View>
          <View style={{ alignItems: 'center' }}>
            <Round icon="hangup" label="End call" bg={colors.danger} onPress={hangUp} hideLabel />
          </View>
        </View>
      )}
    </View>
  );
}

function Round({ icon, label, bg, onPress, hideLabel }: { icon: IconName; label: string; bg: string; onPress: () => void; hideLabel?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color="#FFFFFF" size={32} />
      </Pressable>
      {!hideLabel && <T style={{ color: '#FFFFFF', fontSize: 14, fontFamily: fonts.semibold }}>{label}</T>}
    </View>
  );
}

function Toggle({ icon, label, on, disabled, onPress }: { icon: IconName; label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, opacity: disabled ? 0.4 : 1 }}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: on, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: on ? '#FFFFFF' : colors.navy700, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name={icon} color={on ? colors.navy : '#FFFFFF'} size={26} />
      </Pressable>
      <T style={{ color: colors.soft, fontSize: 13 }}>{label}</T>
    </View>
  );
}

function Small({ icon, label, on, onPress }: { icon: IconName; label: string; on: boolean; onPress: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={onPress} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: on ? '#FFFFFF' : 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={on ? colors.navy : '#FFFFFF'} size={24} />
      </Pressable>
      <T style={{ color: '#FFFFFF', fontSize: 12 }}>{label}</T>
    </View>
  );
}
