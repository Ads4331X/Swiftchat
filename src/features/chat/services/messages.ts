import {
  decryptMessage,
  getConversationEpoch,
  getConversationKeyForEpoch,
} from "@/core/crypto";
import { saveMessage } from "@/core/db";
import { indexMessage } from "@/core/db/search";
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

// parses the `reactions`, `repliedTo` and `attachment` JSON columns.
export function parseLocalMessage(row: LocalMessageRow): Message {
  const { reactions, repliedTo, ...rest } = row;
  const rawAttachment = (row as { attachment?: unknown }).attachment;
  const out: Message = { ...rest, reactions: [], attachment: undefined };
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
  if (typeof rawAttachment === "string" && rawAttachment) {
    try {
      out.attachment = JSON.parse(rawAttachment) as Message["attachment"];
    } catch {
      out.attachment = undefined;
    }
  }
  return out;
}

function getMessageEpoch(message: Message): number {
  const epoch = Number(message.keyEpoch);
  return Number.isInteger(epoch) && epoch >= 1 ? epoch : 1;
}

export async function decryptMessages({
  serverMessages,
  decryptedConversationKey,
}: {
  serverMessages: Message[];
  decryptedConversationKey: Uint8Array | null | undefined;
}): Promise<Message[]> {
  const resolvedKeys = new Map<string, Uint8Array | null>();
  const currentEpochs = new Map<number, number>();

  return Promise.all(
    serverMessages.map(async (message) => {
      const conversationId = Number(message.conversationId);
      const epoch = getMessageEpoch(message);
      const cacheId = `${conversationId}:${epoch}`;

      let conversationKey = resolvedKeys.get(cacheId);
      if (conversationKey === undefined) {
        conversationKey = await getConversationKeyForEpoch(
          conversationId,
          epoch,
        );

        if (!conversationKey && decryptedConversationKey) {
          let currentEpoch = currentEpochs.get(conversationId);
          if (currentEpoch === undefined) {
            currentEpoch = await getConversationEpoch(conversationId);
            currentEpochs.set(conversationId, currentEpoch);
          }
          if (epoch === currentEpoch) {
            conversationKey = decryptedConversationKey;
          }
        }

        resolvedKeys.set(cacheId, conversationKey);
      }

      if (!conversationKey) {
        return {
          ...message,
          encryptedText: message.encryptedText ?? message.text,
          text: "[Encrypted Message]",
        };
      }

      const { decryptMessage: decryptedText } = await decryptMessage({
        encryptedMessage: message.text,
        nonce: message.nonce,
        decryptedConversationKey: conversationKey,
      });

      return {
        ...message,
        encryptedText: message.encryptedText ?? message.text,
        text: decryptedText,
      };
    }),
  );
}

export type PersistLocallyOptions = {
  /** The nonce generated locally for an optimistic send, if any. */
  nonce?: string;
  replyToId?: number;
  repliedTo?: string;
  keyEpoch?: number;
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
    keyEpoch: options?.keyEpoch ?? message.keyEpoch ?? undefined,
    attachment: message.attachment
      ? JSON.stringify(message.attachment)
      : undefined,
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