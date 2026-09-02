import { getToken } from "./secureStorage";
import { io, Socket as SocketType } from "socket.io-client";
import { getBackendUrl } from "./api";

let Socket: SocketType | null = null;

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

export function emitTyping(conversationId: number) {
  return Socket?.emit("typing-start", { conversationId });
}

export function emitStopTyping(conversationId: number) {
  return Socket?.emit("typing-stop", { conversationId });
}

export function listenForTyping(
  callback: (data: { conversationId: number; userId: number }) => void,
) {
  Socket?.on("typing-start", callback);
  return () => Socket?.off("typing-start", callback);
}

export function listenForStopTyping(
  callback: (data: { conversationId: number; userId: number }) => void,
) {
  Socket?.on("typing-stop", callback);
  return () => Socket?.off("typing-stop", callback);
}

export function listenForMarkRead(
  callback: (data: {
    conversationId: number;
    messageId: number;
    userId: number;
    readAt: string;
  }) => void,
) {
  Socket?.on("mark-read", callback);

  return () => {
    Socket?.off("mark-read", callback);
  };
}

export function listenForReaction(
  callback: (data: {
    conversationId: number;
    messageId: number;
    userId: number;
    emoji: string;
    removed: boolean;
  }) => void,
) {
  Socket?.on("message-reaction", callback);

  return () => {
    Socket?.off("message-reaction", callback);
  };
}

export function listenForReactionUpdate(
  callback: (data: {
    conversationId: number;
    messageId: number;
    userId: number;
    emoji: string;
    removed: boolean;
  }) => void,
) {
  Socket?.on("message-reaction-update", callback);

  return () => {
    Socket?.off("message-reaction-update", callback);
  };
}
