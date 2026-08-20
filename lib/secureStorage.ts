import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export async function getToken(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function setToken(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function removeToken(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
export async function setPrivateKey(
  key: string,
  privateKey: string,
): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, privateKey);
    return;
  }

  await SecureStore.setItemAsync(key, privateKey);
}

export async function getPrivateKey(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

export async function removePrivateKey(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}
export async function setPublicKey(
  key: string,
  publicKey: string,
): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, publicKey);
    return;
  }

  await SecureStore.setItemAsync(key, publicKey);
}

export async function getPublicKey(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }

  return SecureStore.getItemAsync(key);
}

export async function removePublicKey(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}
