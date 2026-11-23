import { dialog } from '../components/Dialog';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type RecordingOptions } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

/** Speech quality, mono, about 24 kbit/s: a full minute is about 180 KB. */
const VOICE: RecordingOptions = {
  ...RecordingPresets.LOW_QUALITY,
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 24000,
  android: { extension: '.m4a', outputFormat: 'mpeg4', audioEncoder: 'aac', sampleRate: 16000 },
};
export const MAX_VOICE_SECONDS = 60;

/** Hold-to-record. finish() returns the file and its length, or null if cancelled or too short. */
export function useVoiceRecorder(onLimit: () => void) {
  const recorder = useAudioRecorder(VOICE);
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const started = useRef(0);
  const limitRef = useRef(onLimit);
  limitRef.current = onLimit;

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const s = (Date.now() - started.current) / 1000;
      setSecs(s);
      if (s >= MAX_VOICE_SECONDS) limitRef.current();
    }, 200);
    return () => clearInterval(t);
  }, [recording]);

  async function start() {
    const p = await requestRecordingPermissionsAsync();
    if (!p.granted) {
      dialog('Microphone needed', 'Allow the microphone to send voice notes and make calls.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings() },
      ]);
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    started.current = Date.now();
    setSecs(0);
    setRecording(true);
    return true;
  }

  async function finish(keep: boolean): Promise<{ uri: string; dur: number } | null> {
    if (!recording) return null;
    setRecording(false);
    const dur = (Date.now() - started.current) / 1000;
    await recorder.stop().catch(() => {});
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    if (!keep || dur < 1 || !recorder.uri) return null;
    return { uri: recorder.uri, dur: Math.min(dur, MAX_VOICE_SECONDS) };
  }

  return { recording, secs, start, finish };
}
