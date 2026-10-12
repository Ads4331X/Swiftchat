import { getAssetsAsync, requestPermissionsAsync } from "expo-media-library";
import { useEffect, useState } from "react";

export function useLatestAssest() {
  const [assestUri, setAssestUri] = useState<string | null>(null);

  useEffect(() => {
    const getLatestAssest = async () => {
      const { status } = await requestPermissionsAsync();
      if (status !== "granted") {
        return;
      }

      const result = await getAssetsAsync({
        first: 1,
        mediaType: ["photo", "video"],
        sortBy: [["creationTime", false]],
      });
      if (result.assets.length > 0) {
        setAssestUri(result.assets[0].uri);
      }
    };

    getLatestAssest();
  }, []);

  return assestUri;
}
