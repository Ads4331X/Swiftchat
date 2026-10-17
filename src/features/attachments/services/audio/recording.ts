import { AudioModule, setAudioModeAsync, AudioRecorder } from "expo-audio";

export async function startRecording({
  audioRecorder,
}: {
  audioRecorder: AudioRecorder;
}) {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
    // To record in the background, also set allowsBackgroundRecording: true
    // and enable the enableBackgroundRecording config plugin option.
  });
  // starts the recording
  await audioRecorder.prepareToRecordAsync();
  audioRecorder.record();
}

export async function stopRecording({
  audioRecorder,
}: {
  audioRecorder: AudioRecorder;
}) {
  await audioRecorder.stop();

  return audioRecorder.uri; // return the audio uri
}
