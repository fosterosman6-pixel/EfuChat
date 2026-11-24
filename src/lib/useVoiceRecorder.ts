import { dialog } from '../components/Dialog';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type RecordingOptions } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

/** Speech quality, mono, about 24 kbit/s: a minute is about 180 KB. */
const VOICE: RecordingOptions = {
  ...RecordingPresets.LOW_QUALITY,
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 24000,
  isMeteringEnabled: true,
  android: { extension: '.m4a', outputFormat: 'mpeg4', audioEncoder: 'aac', sampleRate: 16000 },
};
/** Safety stop so a note left recording by mistake doesn't run forever (60 minutes). */
export const MAX_VOICE_SECONDS = 60 * 60;

/** Hold-to-record with lock and pause. finish() returns the file and its length, or null if cancelled or too short. */
export function useVoiceRecorder(onLimit: () => void) {
  const recorder = useAudioRecorder(VOICE);
  const state = useAudioRecorderState(recorder, 120);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [secs, setSecs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const elapsed = useRef(0); // seconds recorded before the current stretch
  const since = useRef(0); // when the current stretch started
  const limitRef = useRef(onLimit);
  limitRef.current = onLimit;

  const now = () => elapsed.current + (paused ? 0 : (Date.now() - since.current) / 1000);

  useEffect(() => {
    if (!recording || paused) return;
    const t = setInterval(() => {
      const s = elapsed.current + (Date.now() - since.current) / 1000;
      setSecs(s);
      if (s >= MAX_VOICE_SECONDS) limitRef.current();
    }, 200);
    return () => clearInterval(t);
  }, [recording, paused]);

  // Live sound wave: keep the last 40 levels (0..1).
  useEffect(() => {
    if (!recording || paused || state.metering === undefined) return;
    const v = Math.max(0.08, Math.min(1, (state.metering + 60) / 60));
    setLevels((l) => [...l.slice(-39), v]);
  }, [state.metering, recording, paused]);

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
    elapsed.current = 0;
    since.current = Date.now();
    setSecs(0);
    setLevels([]);
    setPaused(false);
    setRecording(true);
    return true;
  }

  function togglePause() {
    if (!recording) return;
    if (paused) {
      recorder.record();
      since.current = Date.now();
      setPaused(false);
    } else {
      recorder.pause();
      elapsed.current += (Date.now() - since.current) / 1000;
      setPaused(true);
    }
  }

  async function finish(keep: boolean): Promise<{ uri: string; dur: number } | null> {
    if (!recording) return null;
    const dur = now();
    setRecording(false);
    setPaused(false);
    await recorder.stop().catch(() => {});
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    if (!keep || dur < 1 || !recorder.uri) return null;
    return { uri: recorder.uri, dur: Math.min(dur, MAX_VOICE_SECONDS) };
  }

  return { recording, paused, secs, levels, start, finish, togglePause };
}
