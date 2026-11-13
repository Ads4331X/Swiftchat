import type * as WebRTC from "react-native-webrtc";

type WebRTCModule = typeof WebRTC;

let webRTCModule: WebRTCModule | null = null;

/**
 * Loads react-native-webrtc only when a call actually starts. Importing it at
 * module scope crashes the app at startup when the native module is missing
 * (for example in Expo Go or a dev client built before it was installed).
 */
export function getWebRTC(): WebRTCModule {
  if (webRTCModule) return webRTCModule;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webRTCModule = require("react-native-webrtc") as WebRTCModule;
    return webRTCModule;
  } catch {
    throw new Error(
      "WebRTC is not available in this build. Install react-native-webrtc and rebuild the development client with `npx expo run:android` or `npx expo run:ios`.",
    );
  }
}
