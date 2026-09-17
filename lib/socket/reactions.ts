import { getSocket } from "./client";

export function listenForReaction(
  callback: (data: {
    conversationId: number;
    messageId: number;
    userId: number;
    emoji: string;
    removed: boolean;
  }) => void,
) {
  getSocket()?.on("message-reaction", callback);

  return () => {
    getSocket()?.off("message-reaction", callback);
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
  getSocket()?.on("message-reaction-update", callback);

  return () => {
    getSocket()?.off("message-reaction-update", callback);
  };
}