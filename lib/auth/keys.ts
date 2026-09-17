import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/*
 * During Expo Router static rendering (SSR), Platform.OS is "web" but there
 * is no window. Storage must be a no-op there to avoid crashing the server.
 */
function isWebServer(): boolean {
  return Platform.OS === "web" && typeof window === "undefined";
}

export async function setPrivateKey(
  key: string,
  privateKey: string,
): Promise<void> {
  if (Platform.OS === "web") {
    if (isWebServer()) {
      return;
    }
    window.localStorage.setItem(key, privateKey);
    return;
  }

  await SecureStore.setItemAsync(key, privateKey);
}

export async function getPrivateKey(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    if (isWebServer()) {
      return null;
    }
    return window.localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

export async function removePrivateKey(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (isWebServer()) {
      return;
    }
    window.localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}

export async function setPublicKey(
  key: string,
  publicKey: string,
): Promise<void> {
  if (Platform.OS === "web") {
    if (isWebServer()) {
      return;
    }
    window.localStorage.setItem(key, publicKey);
    return;
  }

  await SecureStore.setItemAsync(key, publicKey);
}

export async function getPublicKey(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    if (isWebServer()) {
      return null;
    }
    return window.localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

export async function removePublicKey(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (isWebServer()) {
      return;
    }
    window.localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}