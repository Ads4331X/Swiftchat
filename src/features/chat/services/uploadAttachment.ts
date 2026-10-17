import { encryptAttachment } from "@/core/crypto";
import { api } from "@/core/api";
import { saveMessage } from "@/core/db";
import { createAttachment } from "@/core/db/attachments";
import { appendEncryptedFile } from "@/core/storage/uploadFile";

// encrypts the file locally, uploads it to the server and stores the
// attachment metadata on the device. returns the new message id.
export async function uploadAttachment({
  uri,
  conversationId,
  caption,
  waveform,
  durationMs,
}: {
  uri: string;
  conversationId: number;
  caption?: string;
  waveform?: number[];
  durationMs?: number;
}) {
  const attachment = await encryptAttachment({
    uri,
    conversationId,
    caption,
    waveform,
    durationMs,
  });

  const formData = new FormData();
  appendEncryptedFile(formData, {
    uri: attachment.encryptedAttachmentUri,
    uuid: attachment.uuid,
    mimeType: attachment.mimeType,
  });

  formData.append("conversationId", String(conversationId));
  formData.append("encryptedKey", attachment.encryptedKey);
  formData.append("keyNonce", attachment.keyNonce);
  formData.append("encryptedHeader", attachment.encryptedHeader);
  formData.append("headerNonce", attachment.headerNonce);
  formData.append("messageText", attachment.encryptedText);
  formData.append("nonce", attachment.nonce);

  const response = await api.post("/api/conversations/messages", formData);
  const messageId = Number(response.data.id);

  await createAttachment({
    messageId,
    localPath: attachment.encryptedAttachmentUri,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    encryptedKey: attachment.encryptedKey,
    keyNonce: attachment.keyNonce,
    encryptedHeader: attachment.encryptedHeader,
    headerNonce: attachment.headerNonce,
    uuid: attachment.uuid,
  });

  await saveMessage({
    messageId,
    message: response.data.text,
    sentAt: String(response.data.sentAt),
    SenderId: Number(response.data.senderId),
    ConversationId: Number(response.data.conversationId),
    nonce: response.data.nonce,
  });

  return messageId;
}
