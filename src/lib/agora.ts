import { getAuth } from '@react-native-firebase/auth';
import Constants from 'expo-constants';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  AudioProfileType,
  AudioScenarioType,
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
  type IRtcEngine,
  type IRtcEngineEventHandler,
} from 'react-native-agora';

/** Set in app.json under expo.extra.agoraAppId. The project must be in Agora's testing mode (no token) until a token server exists. */
const extra = (Constants.expoConfig?.extra ?? {}) as { agoraAppId?: string; callTokenUrl?: string };
export const AGORA_APP_ID: string = extra.agoraAppId ?? '';
/** Cloudflare Worker (token-worker/) that signs Agora tokens for signed-in users. */
const TOKEN_URL: string = extra.callTokenUrl ?? '';

/** Asks the token server for an Agora token for this call. Empty string when no server is set (App ID-only projects). */
export async function callToken(channel: string) {
  if (!TOKEN_URL) return '';
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not signed in');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ channel }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(body.error ?? `Token server error ${res.status}`);
  return body.token;
}

let engine: IRtcEngine | null = null;

function getEngine() {
  if (!engine) {
    engine = createAgoraRtcEngine();
    engine.initialize({ appId: AGORA_APP_ID, channelProfile: ChannelProfileType.ChannelProfileCommunication });
    engine.enableAudio();
    // Speech profile keeps calls light on data bundles.
    engine.setAudioProfile(AudioProfileType.AudioProfileSpeechStandard, AudioScenarioType.AudioScenarioChatroom);
    engine.setDefaultAudioRouteToSpeakerphone(false);
  }
  return engine;
}

export async function micPermission() {
  if (Platform.OS !== 'android') return true;
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone',
    message: 'EfuChat needs the microphone for calls.',
    buttonPositive: 'Allow',
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

/** Joins the voice channel for a call, renewing the token before it runs out. Returns a function that leaves it. */
export async function joinVoice(channel: string, handler: IRtcEngineEventHandler) {
  const token = await callToken(channel);
  const e = getEngine();
  const all: IRtcEngineEventHandler = {
    ...handler,
    onTokenPrivilegeWillExpire: () => {
      callToken(channel).then((t) => e.renewToken(t), () => {});
    },
  };
  handler = all;
  e.registerEventHandler(handler);
  e.joinChannel(token, channel, 0, {
    clientRoleType: ClientRoleType.ClientRoleBroadcaster,
    publishMicrophoneTrack: true,
    autoSubscribeAudio: true,
  });
  return () => {
    e.leaveChannel();
    e.unregisterEventHandler(handler);
  };
}

export const setMuted = (m: boolean) => getEngine().muteLocalAudioStream(m);
export const setSpeaker = (on: boolean) => getEngine().setEnableSpeakerphone(on);
