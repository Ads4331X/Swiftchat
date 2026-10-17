import {
  startRecording,
  stopRecording,
} from "@/features/attachments/services/audio/recording";
import { normalizeSamples } from "@/features/attachments/components/attachment/utils";
import { AudioModule, RecordingPresets, useAudioRecorder } from "expo-audio";
import { File } from "expo-file-system";
import { useRef, useState } from "react";
import { Alert, Platform } from "react-native";

const MIN_DB = -60;
const METER_INTERVAL_MS = 100;

function dbToLevel(db: number | undefined): number {
  if (db == null) return 0;
  const clamped = Math.max(MIN_DB, Math.min(0, db));
  const linear = (clamped - MIN_DB) / -MIN_DB;
  return Math.pow(linear, 1.6);
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);

  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    numberOfChannels: 1,
    bitRate: 64000,
    web: {
      ...RecordingPresets.HIGH_QUALITY.web,
      bitsPerSecond: 64000,
    },
    isMeteringEnabled: true,
  });

  const samplesRef = useRef<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startMetering() {
    samplesRef.current = [];
    timerRef.current = setInterval(() => {
      samplesRef.current.push(dbToLevel(recorder.getStatus().metering));
    }, METER_INTERVAL_MS);
  }

  function stopMetering(): number[] {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    return normalizeSamples(samplesRef.current);
  }

  const start = async () => {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission to access microphone was denied");
      return;
    }

    setAudioUri(null);
    await startRecording({ audioRecorder: recorder });
    setIsRecording(true);
    startMetering();
  };

  const stop = async () => {
    const durationMs = recorder.getStatus().durationMillis;
    const waveform = stopMetering();
    const uri = await stopRecording({ audioRecorder: recorder });
    setAudioUri(uri);
    setIsRecording(false);
    return { uri, waveform, durationMs };
  };

  const del = async () => {
    stopMetering();
    const uri = await stopRecording({ audioRecorder: recorder });
    setIsRecording(false);
    setAudioUri(null);

    if (!uri) return;

    try {
      if (Platform.OS === "web") {
        URL.revokeObjectURL(uri);
        return;
      }
      new File(uri).delete();
    } catch (error) {
      console.warn("Failed to delete recording", error);
    }
  };

  return {
    isRecording,
    startRecording: start,
    stopRecording: stop,
    deleteRecording: del,
    audioUri,
  };
}
