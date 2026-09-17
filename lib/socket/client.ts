import { getToken } from "@/lib/auth";
import { io, Socket as SocketType } from "socket.io-client";
import { getBackendUrl } from "@/lib/api";

let Socket: SocketType | null = null;

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