import { getToken } from "@/lib/auth";
import { io, Socket as SocketType } from "socket.io-client";
import { getBackendUrl } from "@/lib/api";

let Socket: SocketType | null = null;

const presenceListeners = new Set<
  (data: { userId: number; lastSeen: string | null }) => void
>();

export function getSocket(): SocketType | null {
  return Socket;
}

export async function connectSocket() {
  if (Socket) return;

  const token = await getToken("token");

  if (!token) {
    console.log("No token found");
    return;
  }

  Socket = io(getBackendUrl(), {
    reconnectionDelayMax: 10000,
    auth: {
      token,
    },
  });

  Socket.on("connect", () => {
    console.log("Socket connected:", Socket?.id);
    presenceListeners.forEach((callback) => Socket?.on("presence", callback));
  });
}

export function joinConversation({ id }: { id: string | number }) {
  Socket?.emit("join-conversation", Number(id));
}

export function joinConversations(ids: number[]) {
  ids.forEach((conversationId) =>
    Socket?.emit("join-conversation", conversationId),
  );
}

export function disconnectSocket() {
  Socket?.disconnect();
  Socket = null;
}

export function listenForPresence(
  callback: (data: { userId: number; lastSeen: string | null }) => void,
) {
  presenceListeners.add(callback);
  Socket?.on("presence", callback);

  return () => {
    presenceListeners.delete(callback);
    Socket?.off("presence", callback);
  };
}
