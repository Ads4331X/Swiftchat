import { getToken } from "@/lib/secureStorage";

export async function getCurrentUserId(): Promise<number | null> {
  const token = await getToken("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.userId ?? null;
  } catch {
    return null;
  }
}
