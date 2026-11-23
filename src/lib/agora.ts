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
export const AGORA_APP_ID: string = (Constants.expoConfig?.extra as { agoraAppId?: string } | undefined)?.agoraAppId ?? '';

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

/** Joins the voice channel for a call. Returns a function that leaves it. */
export function joinVoice(channel: string, handler: IRtcEngineEventHandler) {
  const e = getEngine();
  e.registerEventHandler(handler);
  e.joinChannel('', channel, 0, {
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
