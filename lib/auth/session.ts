import { Base64 } from "js-base64";
import { getToken } from "./token";

export async function getCurrentUserId(): Promise<number | null> {
  const token = await getToken("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(Base64.atob(token.split(".")[1]));
    return payload.userId ?? null;
  } catch {
    return null;
  }
}