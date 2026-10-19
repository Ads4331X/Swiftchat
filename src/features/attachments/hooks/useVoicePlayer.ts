import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

export function useVoicePlayer({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri || null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  const play = () => {
    if (uri) {
      player.play();
    }
  };

  const pause = () => {
    player.pause();
  };

  const seekTo = (time: number) => {
    if (!status.isLoaded || !Number.isFinite(time) || time < 0) {
      return;
    }

    // Web reports duration as NaN until media metadata loads; still allow the
    // seek so the browser stores it as the default playback position. Clamp
    // only when a real duration is known.
    const duration = status.duration;
    const clamped =
      Number.isFinite(duration) && duration > 0
        ? Math.min(time, duration)
        : time;

    player.seekTo(clamped);
  };

  return {
    play,
    pause,
    seekTo,
    player,
    status,
  };
}
