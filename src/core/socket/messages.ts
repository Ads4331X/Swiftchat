import { getSocket } from "@/core/socket/client";

export function listenForNewMessages(callback: (message: any) => void) {
  getSocket()?.on("new-message", callback);

  return () => {
    getSocket()?.off("new-message", callback);
  };
}

export function listenForMessageUpdates(callback: (message: any) => void) {
  getSocket()?.on("message-updated", callback);

  return () => {
    getSocket()?.off("message-updated", callback);
  };
}

export function listenForMessageDeletes(
  callback: (message: { id: number }) => void,
) {
  getSocket()?.on("message-deleted", callback);

  return () => {
    getSocket()?.off("message-deleted", callback);
  };
}

export function emitTyping(conversationId: number) {
  return getSocket()?.emit("typing-start", { conversationId });
}

export function emitStopTyping(conversationId: number) {
  return getSocket()?.emit("typing-stop", { conversationId });
}

export function listenForTyping(
  callback: (data: { conversationId: number; userId: number }) => void,
) {
  getSocket()?.on("typing-start", callback);
  return () => getSocket()?.off("typing-start", callback);
}

export function listenForStopTyping(
  callback: (data: { conversationId: number; userId: number }) => void,
) {
  getSocket()?.on("typing-stop", callback);
  return () => getSocket()?.off("typing-stop", callback);
}

export function listenForMarkRead(
  callback: (data: {
    conversationId: number;
    messageId: number;
    userId: number;
    readAt: string;
  }) => void,
) {
  getSocket()?.on("mark-read", callback);

  return () => {
    getSocket()?.off("mark-read", callback);
  };
}

export function listenForGroupDelete(
  callback: (data: { conversationId: number }) => void,
) {
  getSocket()?.on("group-deleted", callback);
  return () => {
    getSocket()?.off("group-deleted", callback);
  };
}