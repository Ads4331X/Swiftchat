import { useEffect, useRef, useState } from "react";
import {
  emitStopTyping,
  emitTyping,
  listenForStopTyping,
  listenForTyping,
} from "@/core/socket";

export default function useChatTyping(
  conversationId: string,
  currentUserId: number | null,
) {
  const [isOtherUserTyping, setIsOtherUserTyping] = useState<number[]>([]);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stopTypingSub = listenForTyping(
      ({ conversationId: incomingId, userId }) => {
        if (
          Number(incomingId) === Number(conversationId) &&
          userId !== currentUserId
        ) {
          setIsOtherUserTyping((prev) =>
            prev.includes(userId) ? prev : [...prev, userId],
          );
        }
      },
    );
    const stopStopTypingSub = listenForStopTyping(
      ({ conversationId: incomingId, userId }) => {
        if (
          Number(incomingId) === Number(conversationId) &&
          userId !== currentUserId
        ) {
          setIsOtherUserTyping((prev) =>
            prev.filter((id) => id !== userId),
          );
        }
      },
    );

    return () => {
      stopTypingSub?.();
      stopStopTypingSub?.();
    };
  }, [conversationId, currentUserId]);

  useEffect(
    () => () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    },
    [],
  );

  const notifyDraftChange = () => {
    emitTyping(Number(conversationId));
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      emitStopTyping(Number(conversationId));
    }, 2000);
  };

  const stopTyping = () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    emitStopTyping(Number(conversationId));
  };

  return { isOtherUserTyping, notifyDraftChange, stopTyping };
}
