import { getToken } from "@/features/auth/services";
import { io, Socket as SocketType } from "socket.io-client";
import { getBackendUrl } from "@/core/api";

let Socket: SocketType | null = null;

const presenceListeners = new Set<
  (data: { userId: number; lastSeen: string | null }) => void
>();

type SocketEventListener = {
  event: string;
  callback: (...args: any[]) => void;
};

const socketEventListeners = new Set<SocketEventListener>();
let listenersSocket: SocketType | null = null;

function attachSocketListener(
  socket: SocketType,
  listener: SocketEventListener,
) {
  socket.on(listener.event, listener.callback);
}

function attachAllSocketListeners() {
  if (!Socket || listenersSocket === Socket) return;

  socketEventListeners.forEach((listener) =>
    attachSocketListener(Socket!, listener),
  );
  listenersSocket = Socket;
}

export function getSocket(): SocketType | null {
  return Socket;
}

/**
 * Registers a socket event listener even if the socket has not connected yet.
 * Listeners registered before `connectSocket()` are attached once it opens,
 * and remain attached across socket.io reconnects.
 */
export function listenForSocketEvent(
  event: string,
  callback: (...args: any[]) => void,
) {
  const listener = { event, callback };
  socketEventListeners.add(listener);

  if (Socket) {
    attachSocketListener(Socket, listener);
    listenersSocket = Socket;
  }

  return () => {
    socketEventListeners.delete(listener);
    (listenersSocket ?? Socket)?.off(event, callback);
  };
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

  attachAllSocketListeners();

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
  listenersSocket = null;
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
