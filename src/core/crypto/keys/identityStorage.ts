import { getCurrentUserId, getPrivateKey } from "@/features/auth/services";

export async function getIdentityKeyNames() {
  const userId = await getCurrentUserId();
  // suffix is for multi user login on save device
  const suffix = userId ? `_u${userId}` : "";

  return {
    privateKeyName: `privateKey${suffix}`,
    publicKeyName: `publicKey${suffix}`,
  };
}

export async function getCurrentUserPrivateKey(): Promise<string | null> {
  const { privateKeyName } = await getIdentityKeyNames();
  return getPrivateKey(privateKeyName);
}
