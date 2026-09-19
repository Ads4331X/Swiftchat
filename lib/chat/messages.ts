import { decryptMessage } from "@/lib/crypto";
import { saveMessage } from "@/lib/db";
import { indexMessage } from "@/lib/db/search";
import {
  Message,
  MessageReaction,
  RepliedTo,
} from "@/types/message";

export const PAGE_SIZE = 50;

export function keyFor(message: Message): string {
  return message.key ?? `m-${message.id}`;
}

export type LocalMessageRow = Message & {
  reactions?: string | null;
  repliedTo?: string | null;
};

// SQLite returns the `reactions` column as a JSON string. Parse it back into
// the `MessageReaction[]` shape used in-memory, treating invalid/empty values
// as "no reactions". Same for the `repliedTo` quote snapshot.
export function parseLocalMessage(row: LocalMessageRow): Message {
  const { reactions, repliedTo, ...rest } = row;
  const out: Message = { ...rest, reactions: [] };
  if (reactions) {
    try {
      const parsed = JSON.parse(reactions);
      out.reactions = Array.isArray(parsed)
        ? (parsed as MessageReaction[])
        : [];
    } catch {
      out.reactions = [];
    }
  }
  if (repliedTo) {
    try {
      out.repliedTo = JSON.parse(repliedTo) as RepliedTo;
    } catch {
      out.repliedTo = undefined;
    }
  }
  return out;
}

export async function decryptMessages({
  serverMessages,
  decryptedConversationKey,
}: {
  serverMessages: Message[];
  decryptedConversationKey: Uint8Array | null | undefined;
}): Promise<Message[]> {
  // No conversation key on this device (private key not restored yet). We
  // still surface the messages so the user sees them, but as placeholders —
  // and we must NEVER generate a key here (that would break decryption for
  // other members).
  if (!decryptedConversationKey) {
    return serverMessages.map((message) => ({
      ...message,
      text: "[Encrypted Message]",
    }));
  }

  return Promise.all(
    serverMessages.map(async (message) => {
      const { decryptMessage: decryptedText } = await decryptMessage({
        encryptedMessage: message.text,
        nonce: message.nonce,
        decryptedConversationKey,
      });

      return { ...message, text: decryptedText };
    }),
  );
}

export type PersistLocallyOptions = {
  /** The nonce generated locally for an optimistic send, if any. */
  nonce?: string;
  replyToId?: number;
  repliedTo?: string;
};

// Persist one message to the local cache (raw encrypted text for the DB) and
// index its decrypted content for local search.
export async function persistMessageLocally(
  message: Message,
  decryptedText: string,
  options?: PersistLocallyOptions,
) {
  await saveMessage({
    messageId: Number(message.id),
    message: message.text,
    sentAt: String(message.sentAt),
    SenderId: Number(message.senderId),
    ConversationId: Number(message.conversationId),
    nonce: options?.nonce ?? message.nonce,
    reactions: message.reactions
      ? JSON.stringify(message.reactions)
      : undefined,
    replyToId: options?.replyToId ?? message.replyToId,
    repliedTo:
      options?.repliedTo ??
      (message.repliedTo ? JSON.stringify(message.repliedTo) : undefined),
    forwardedFromMsgId: message.forwardedFromMsgId,
  });

  await indexMessage({ messageId: Number(message.id), content: decryptedText });
}

// Persist a batch of server messages to the local cache. Both arrays come
// from the same source so entries line up by index.
export async function persistServerMessages(
  serverMessages: Message[],
  decryptedMessages: Message[],
) {
  for (let i = 0; i < serverMessages.length; i++) {
    const serverMessage = serverMessages[i];
    const decryptedMessage = decryptedMessages[i];
    if (!serverMessage || !decryptedMessage) continue;
    await persistMessageLocally(serverMessage, decryptedMessage.text);
  }
}