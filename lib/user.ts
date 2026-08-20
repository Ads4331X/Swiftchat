import { api } from "./api";

export async function getUserPublicKey(userId: number): Promise<string> {
  const response = await api.get(`/api/user/${userId}/public-key`);

  return response.data.publicKey;
}
