import {
  describeSdp,
  describeTrack,
  sanitizeIceUrl,
} from "../call-debug";

describe("call debug logging", () => {
  it("strips credentials and query data from ICE server URLs", () => {
    expect(
      sanitizeIceUrl("turns:user:secret@turn.example.com:443?transport=tcp"),
    ).toBe("turns:turn.example.com:443");
    expect(
      sanitizeIceUrl("turn://user:secret@turn.example.com:3478?token=abc"),
    ).toBe("turn:turn.example.com:3478");
    expect(sanitizeIceUrl("stun:stun.example.com:19302")).toBe(
      "stun:stun.example.com:19302",
    );
  });

  it("summarizes SDP media without logging its contents", () => {
    expect(describeSdp("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n")).toEqual({
      media: ["audio", "video"],
      audio: true,
      video: true,
    });
    expect(describeSdp(undefined)).toEqual({
      media: [],
      audio: false,
      video: false,
    });
  });

  it("describes remote tracks for screen-share diagnosis", () => {
    expect(
      describeTrack({
        id: "screen-track",
        kind: "video",
        enabled: true,
        muted: false,
        readyState: "live",
      }),
    ).toEqual({
      id: "screen-track",
      kind: "video",
      enabled: true,
      muted: false,
      readyState: "live",
    });
    expect(describeTrack(undefined)).toBeNull();
  });
});
