import { getToken } from "./secureStorage";
import { io, Socket as SocketType } from "socket.io-client";

let Socket: SocketType | null = null;

export async function connectSocket() {
  if (Socket) return;

  const token = await getToken("token");

  if (!token) {
    console.log("No token found");
    return;
  }

  Socket = io(process.env.EXPO_PUBLIC_BACKEND_URL, {
    reconnectionDelayMax: 10000,
    auth: {
      token,
    },
  });

  Socket.on("connect", () => {
    console.log("Socket connected:", Socket?.id);
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

export function listenForNewMessages(callback: (message: any) => void) {
  Socket?.on("new-message", callback);

  return () => {
    Socket?.off("new-message", callback);
  };
}

export function listenForMessageUpdates(callback: (message: any) => void) {
  Socket?.on("message-updated", callback);

  return () => {
    Socket?.off("message-updated", callback);
  };
}

export function listenForMessageDeletes(
  callback: (message: { id: number }) => void,
) {
  Socket?.on("message-deleted", callback);

  return () => {
    Socket?.off("message-deleted", callback);
  };
}

export function disconnectSocket() {
  Socket?.disconnect();
  Socket = null;
}
