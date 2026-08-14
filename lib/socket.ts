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

export function joinConversation({ id }: { id: string }) {
  Socket?.emit("join-conversation", id);
}

export function listenForNewMessages(callback: (message: any) => void) {
  Socket?.on("new-message", callback);
}

export function disconnectSocket() {
  Socket?.disconnect();
  Socket = null;
}
