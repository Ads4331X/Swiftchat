type IceServer = NonNullable<RTCConfiguration["iceServers"]>[number];

const STUN_URL_KEYS = ["EXPO_PUBLIC_STUN_URLS", "EXPO_PUBLIC_STUN_URL"];
const TURN_URL_KEYS = ["EXPO_PUBLIC_TURN_URLS", "EXPO_PUBLIC_TURN_URL"];

function readEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function parseUrls(value: string, protocols: string[]) {
  const allowed = new RegExp(`^(?:${protocols.join("|")}):`, "i");
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((url) => url.trim())
        .filter((url) => allowed.test(url)),
    ),
  );
}

export function getStunUrls() {
  return parseUrls(readEnv(STUN_URL_KEYS), ["stun", "stuns"]);
}

export function getTurnUrls() {
  return parseUrls(readEnv(TURN_URL_KEYS), ["turn", "turns"]);
}

function getTurnCredentials() {
  return {
    username: process.env.EXPO_PUBLIC_TURN_USERNAME?.trim() ?? "",
    credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL?.trim() ?? "",
  };
}

export function hasTurnCredentials() {
  const { username, credential } = getTurnCredentials();
  return Boolean(getTurnUrls().length > 0 && username && credential);
}

export function getIceServers(): IceServer[] {
  const iceServers: IceServer[] = [];
  const stunUrls = getStunUrls();
  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  }

  const turnUrls = getTurnUrls();
  const { username, credential } = getTurnCredentials();
  if (turnUrls.length > 0 && username && credential) {
    iceServers.push({ urls: turnUrls, username, credential });
  }

  return iceServers;
}
