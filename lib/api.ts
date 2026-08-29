import axios from "axios";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { getToken } from "@/lib/secureStorage";

export function getBackendUrl(): string {
  let envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envUrl && envUrl.trim() !== "") {
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

  return "http://192.168.1.72:3000";
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

