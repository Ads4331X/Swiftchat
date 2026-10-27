import {
  getIceServers,
  getStunUrls,
  getTurnUrls,
  hasTurnCredentials,
} from "../webrtc-config";

const KEYS = [
  "EXPO_PUBLIC_STUN_URLS",
  "EXPO_PUBLIC_STUN_URL",
  "EXPO_PUBLIC_TURN_URLS",
  "EXPO_PUBLIC_TURN_URL",
  "EXPO_PUBLIC_TURN_USERNAME",
  "EXPO_PUBLIC_TURN_CREDENTIAL",
] as const;

const original = Object.fromEntries(
  KEYS.map((key) => [key, process.env[key]]),
);

function resetEnv() {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}

afterEach(resetEnv);
afterAll(resetEnv);

describe("WebRTC ICE configuration", () => {
  it("parses and validates STUN and TURN URLs", () => {
    process.env.EXPO_PUBLIC_STUN_URLS =
      "stun:stun.example.com:3478, invalid:example.com stuns:stun.example.com:5349";
    process.env.EXPO_PUBLIC_TURN_URLS =
      "turn:turn.example.com:3478?transport=udp,http://invalid.example.com";
    process.env.EXPO_PUBLIC_TURN_USERNAME = "user";
    process.env.EXPO_PUBLIC_TURN_CREDENTIAL = "secret";

    expect(getStunUrls()).toEqual([
      "stun:stun.example.com:3478",
      "stuns:stun.example.com:5349",
    ]);
    expect(getTurnUrls()).toEqual([
      "turn:turn.example.com:3478?transport=udp",
    ]);
    expect(hasTurnCredentials()).toBe(true);
    expect(getIceServers()).toEqual([
      { urls: getStunUrls() },
      {
        urls: getTurnUrls(),
        username: "user",
        credential: "secret",
      },
    ]);
  });

  it("does not add TURN when credentials are missing", () => {
    process.env.EXPO_PUBLIC_STUN_URLS = "stun:stun.example.com:3478";
    process.env.EXPO_PUBLIC_TURN_URLS = "turn:turn.example.com:3478";
    process.env.EXPO_PUBLIC_TURN_USERNAME = "user";

    expect(hasTurnCredentials()).toBe(false);
    expect(getIceServers()).toEqual([
      { urls: ["stun:stun.example.com:3478"] },
    ]);
  });

  it("does not add TURN when no valid TURN URL is configured", () => {
    process.env.EXPO_PUBLIC_TURN_URLS = "https://example.com/turn";
    process.env.EXPO_PUBLIC_TURN_USERNAME = "user";
    process.env.EXPO_PUBLIC_TURN_CREDENTIAL = "secret";

    expect(hasTurnCredentials()).toBe(false);
    expect(getIceServers()).toEqual([]);
  });
});
