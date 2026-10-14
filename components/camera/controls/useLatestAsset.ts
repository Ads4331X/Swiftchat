import { useCallback, useEffect, useState } from "react";
import {
  addListener,
  getAssetsAsync,
  requestPermissionsAsync,
} from "expo-media-library";

// loads the newest photo/video so the gallery thumbnail always renders
export function useLatestAsset() {
  const [uri, setUri] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { status } = await requestPermissionsAsync();
      if (status !== "granted") return;

      const result = await getAssetsAsync({
        first: 1,
        mediaType: ["photo", "video"],
        sortBy: [["creationTime", false]],
      });

      setUri(result.assets[0]?.uri ?? null);
    } catch {
      // keep the previous thumbnail
    }
  }, []);

  useEffect(() => {
    refresh();
    const sub = addListener(refresh);
    return () => sub.remove();
  }, [refresh]);

  return { uri, refresh };
}
