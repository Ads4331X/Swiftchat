import { getToken } from "./secureStorage";
import { io, Socket as SocketType } from "socket.io-client";

let Socket: SocketType | null = null;

export async function connectSocket() {
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

export function listenForNewMessages() {
  Socket?.on("new-message", (message) => {
    console.log("New message:", message);
    // add sql lite and update ui
  });
}

export function disconnectSocket() {
  Socket?.disconnect();
  Socket = null;
}
