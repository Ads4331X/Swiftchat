import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/*
 * During Expo Router static rendering (SSR), Platform.OS is "web" but there
 * is no window. Storage must be a no-op there to avoid crashing the server.
 */
function isWebServer(): boolean {
  return Platform.OS === "web" && typeof window === "undefined";
}

export async function getToken(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    if (isWebServer()) {
      return null;
    }
    return window.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function setToken(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (isWebServer()) {
      return;
    }
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function removeToken(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (isWebServer()) {
      return;
    }
    window.localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}