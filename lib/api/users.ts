import { api } from "./client";

export async function getUserPublicKey(userId: number): Promise<string> {
  const response = await api.get(`/api/user/${userId}/public-key`);

  return response.data.publicKey;
}

export async function blockUser(userId: number) {
  const response = await api.post("/api/user/block", {
    userId,
  });

  return response.data;
}

export async function unblockUser(userId: number) {
  const response = await api.delete("/api/user/block", {
    data: { userId },
  });

  return response.data;
}

export async function getBlockedUsers(): Promise<number[]> {
  const response = await api.get("/api/user/blocks");
  const list = Array.isArray(response.data) ? response.data : [];

  return list.map((row: { blockedId: number }) => Number(row.blockedId));
}