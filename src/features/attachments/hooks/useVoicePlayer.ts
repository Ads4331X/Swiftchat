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
    player.seekTo(time);
  };

  return {
    play,
    pause,
    seekTo,
    player,
    status,
  };
}
