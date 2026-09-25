import axios from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { router } from "expo-router";
import { getToken, removeToken } from "@/lib/auth";

export function getBackendUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl && envUrl.trim() !== "") {
    // Use the override as-is. On a USB-connected Android device,
    // `localhost:3000` is tunneled to this machine via `adb reverse`
    // (scripts/adb-reverse.sh) — far more reliable than a flaky LAN/Wi-Fi
    // path. Do NOT rewrite localhost here: that would defeat the tunnel.
    return envUrl;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.developer?.manifest?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(":")[0];
    if (host && !host.includes("exp.direct") && !host.includes("ngrok")) {
      return `http://${host}:3000`;
    }
  }

  // Last-resort dev default. Android reaches this machine's backend through
  // the USB `adb reverse` tunnel; everything else hits the LAN IP.
  return Platform.OS === "android"
    ? "http://localhost:3000"
    : "http://192.168.1.72:3000";
}

const backendUrl = getBackendUrl();
console.log("[API] Connecting to Backend URL:", backendUrl);

export const api = axios.create({
  baseURL: backendUrl,
  timeout: 10000,
});

api.interceptors.request.use(async (config) => {
  const token = await getToken("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let sessionExpiredHandled = false;

api.interceptors.response.use(
  (response) => {
    // A request succeeded — the session is alive again, so a later 401 can
    // trigger a fresh logout redirect.
    sessionExpiredHandled = false;
    return response;
  },
  async (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? "";
    // Login/register/auth endpoints legitimately return 401 (bad credentials) —
    // never treat those as an expired session.
    const isAuthEndpoint = url.includes("/api/auth/");

    if (
      status === 401 &&
      !isAuthEndpoint &&
      !sessionExpiredHandled &&
      (await getToken("token"))
    ) {
      // Token rejected by the server (rotated secret, cleared DB, etc.). Clear
      // it, drop the socket, and bounce to the welcome screen so the user can
      // log in again instead of looping on retries. A flag stops concurrent
      // in-flight requests from each firing a redirect.
      sessionExpiredHandled = true;
      await removeToken("token").catch(() => {});
      const { disconnectSocket } = await import("@/lib/socket");
      disconnectSocket();
      try {
        router.replace("/");
      } catch {
        if (typeof window !== "undefined") {
          window.location.href = "/";
        }
      }
    }

    return Promise.reject(error);
  },
);