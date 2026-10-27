import type { MediaStream } from "react-native-webrtc";

import { shouldMirrorLocalVideo } from "../call-video-utils";

function makeStream(facingMode?: string) {
  return {
    getVideoTracks: () => [
      {
        getSettings: () => ({ facingMode }),
      },
    ],
  } as unknown as MediaStream;
}

describe("local call video presentation", () => {
  it("mirrors the front camera", () => {
    expect(shouldMirrorLocalVideo(makeStream("user"))).toBe(true);
  });

  it("does not mirror the rear camera", () => {
    expect(shouldMirrorLocalVideo(makeStream("environment"))).toBe(false);
    expect(shouldMirrorLocalVideo(makeStream("back"))).toBe(false);
  });

  it("does not mirror when the camera facing mode is unavailable", () => {
    expect(shouldMirrorLocalVideo(makeStream(undefined))).toBe(false);
    expect(shouldMirrorLocalVideo(null)).toBe(false);
  });
});
