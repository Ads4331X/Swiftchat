export type MessageReaction = {
  emoji: string;
  user: { id: number };
};

export type RepliedTo = {
  senderName: string;
  senderAvatar?: string;
  text: string;
};

export type Message = {
  id: number;
  text: string;
  sentAt: string;
  editedAt: string | null;
  senderId: number;
  conversationId: number;
  nonce: string;

  /** Stable client key so optimistic rows keep their position when confirmed. */
  key?: string;

  /** Whether the recipient has read this message (own messages only). */
  read?: boolean;

  /** Group read receipt state. */
  hasAnyoneRead?: boolean;
  hasEveryoneRead?: boolean;

  /** Emoji reactions attached to this message (from the server). */
  reactions?: MessageReaction[];

  /** If this message is a reply, the quoted original message info. */
  repliedTo?: RepliedTo;

  /** ID of the original message this message is replying to. */
  replyToId?: number;
  forwardedFromMsgId?: number;
};