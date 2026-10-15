import { encryptAttachment } from "@/lib/crypto";
import { useCallback, useState } from "react";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { getCurrentUserId } from "@/lib/auth";
import { getConversationOtherUser, saveMessage } from "@/lib/db";
import { createAttachment } from "@/lib/db/attachments";
import { appendEncryptedFile } from "@/lib/storage/uploadFile";
import { compressImage, compressVideo } from "@/lib/utils";
import { safeDelete } from "./utils";
import type { SendImage, SendVideo } from "./types";

export function useSendImages({
  conversationId,
}: {
  conversationId: number | null;
}) {
  const [sending, setSending] = useState(false);

  const sendImages = useCallback(
    async (images: SendImage[], caption: string) => {
      if (conversationId == null) {
        console.warn("AttachmentReview: no conversationId available");
        return;
      }
      if (!images.length) return;

      setSending(true);
      try {
        // upload every picked image, remembering the last id to open the chat on
        let lastMessageId: number | null = null;

        for (const image of images) {
          lastMessageId = await uploadImage({ image, conversationId, caption });
        }

        if (lastMessageId != null) {
          await openConversation(conversationId, lastMessageId);
        }
      } finally {
        setSending(false);
      }
    },
    [conversationId],
  );

  const sendVideos = useCallback(
    async (videos: SendVideo[], caption: string) => {
      if (conversationId == null) {
        console.warn("AttachmentReview: no conversationId available");
        return;
      }
      if (!videos.length) return;

      setSending(true);
      try {
        // upload every picked video, remembering the last id to open the chat on
        let lastMessageId: number | null = null;

        for (const video of videos) {
          lastMessageId = await uploadVideo({ video, conversationId, caption });
        }

        if (lastMessageId != null) {
          await openConversation(conversationId, lastMessageId);
        }
      } finally {
        setSending(false);
      }
    },
    [conversationId],
  );

  // sends images and videos together, opening the chat once at the end.
  const send = useCallback(
    async ({
      images = [],
      videos = [],
      caption = "",
    }: {
      images?: SendImage[];
      videos?: SendVideo[];
      caption?: string;
    }) => {
      if (conversationId == null) {
        console.warn("AttachmentReview: no conversationId available");
        return;
      }
      if (!images.length && !videos.length) return;

      setSending(true);
      try {
        // remember the last id so we can open the chat on it
        let lastMessageId: number | null = null;

        for (const image of images) {
          lastMessageId = await uploadImage({ image, conversationId, caption });
        }
        for (const video of videos) {
          lastMessageId = await uploadVideo({ video, conversationId, caption });
        }

        if (lastMessageId != null) {
          await openConversation(conversationId, lastMessageId);
        }
      } finally {
        setSending(false);
      }
    },
    [conversationId],
  );

  return { send, sendImages, sendVideos, sending };
}

// shrinks the image down to the size limits before it is encrypted. Falls back
// to the original when we have nothing to measure it with.
async function prepareImage(image: SendImage) {
  const { uri, width, height, size } = image;

  if (width == null || height == null || size == null) return uri;

  try {
    const result = await compressImage({ uri, width, height, size });
    return result.uri;
  } catch (error) {
    console.warn(
      "AttachmentReview: image compression failed, sending original",
      error,
    );
    return uri;
  }
}

async function uploadImage({
  image,
  conversationId,
  caption,
}: {
  image: SendImage;
  conversationId: number;
  caption: string;
}) {
  const uri = await prepareImage(image);
  const compressed = uri !== image.uri;

  try {
    return await uploadImageFile({ uri, conversationId, caption });
  } finally {
    // the compressed copy is a throwaway, the encrypted file is what we keep
    if (compressed) safeDelete(uri);
  }
}

// shrinks heavy videos down before they are encrypted. Falls back to the
// original when we have nothing to measure it with.
async function prepareVideo(video: SendVideo) {
  const { uri, width, height, size, mimeType } = video;

  if (width == null || height == null || size == null) return uri;

  try {
    const result = await compressVideo({
      uri,
      width,
      height,
      size,
      mimeType: mimeType ?? "video/mp4",
    });
    return result.uri;
  } catch (error) {
    console.warn(
      "AttachmentReview: video compression failed, sending original",
      error,
    );
    return uri;
  }
}

async function uploadVideo({
  video,
  conversationId,
  caption,
}: {
  video: SendVideo;
  conversationId: number;
  caption: string;
}) {
  const uri = await prepareVideo(video);
  const compressed = uri !== video.uri;

  try {
    return await uploadImageFile({ uri, conversationId, caption });
  } finally {
    // the compressed copy is a throwaway, the encrypted file is what we keep
    if (compressed) safeDelete(uri);
  }
}

async function uploadImageFile({
  uri,
  conversationId,
  caption,
}: {
  uri: string;
  conversationId: number;
  caption: string;
}) {
  // encryptes the image locally
  const image = await encryptAttachment({ uri, conversationId, caption });

  const formData = new FormData();
  appendEncryptedFile(formData, {
    uri: image.encryptedAttachmentUri,
    uuid: image.uuid,
    mimeType: image.mimeType,
  });

  formData.append("conversationId", String(conversationId));
  formData.append("encryptedKey", image.encryptedKey);
  formData.append("keyNonce", image.keyNonce);
  formData.append("encryptedHeader", image.encryptedHeader);
  formData.append("headerNonce", image.headerNonce);
  formData.append("messageText", image.encryptedText);
  formData.append("nonce", image.nonce);

  // upload the data to the server
  const response = await api.post("/api/conversations/messages", formData);
  const messageId = Number(response.data.id);

  // saves the file metadata locally
  await createAttachment({
    messageId,
    localPath: image.encryptedAttachmentUri,
    mimeType: image.mimeType,
    fileSize: image.fileSize,
    encryptedKey: image.encryptedKey,
    keyNonce: image.keyNonce,
    encryptedHeader: image.encryptedHeader,
    headerNonce: image.headerNonce,
    uuid: image.uuid,
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

async function openConversation(conversationId: number, messageId: number) {
  const currentUserId = await getCurrentUserId();
  const cached = await getConversationOtherUser(conversationId);

  // seed from the local cache, then refresh from the server (also covers groups)
  let username = cached?.otherUsername ?? "";
  let avatarUrl = cached?.otherAvatarUrl ?? "";
  let memberIds = cached?.otherUserId ? [cached.otherUserId] : [];

  try {
    const { data } = await api.get("/api/conversations");
    const conversations: any[] = Array.isArray(data) ? data : [];
    const conversation = conversations.find(
      (item) =>
        String(item.conversationId ?? item.id) === String(conversationId),
    );

    const members: any[] = conversation?.members ?? [];

    // memberIds excludes the current user, matching the chat list / [id] isGroup check
    const others = members
      .map((member) => Number(member.id))
      .filter((id) => Number.isFinite(id) && id !== currentUserId);

    if (others.length) {
      memberIds = others;

      const other = members.find((member) => Number(member.id) === others[0]);

      if (other) {
        username = other.username ?? username;
        avatarUrl = other.avatar ?? other.avatarUrl ?? avatarUrl;

        // the cached avatar can be null; pull the freshest value
        const { data: profile } = await api.get(`/api/user/${others[0]}`);
        username = profile?.username ?? username;
        avatarUrl = profile?.avatar ?? profile?.avatarUrl ?? avatarUrl;
      }
    }
  } catch {
    // fall back to the locally cached values
  }

  // dismiss back to the chat we came from, so the review/camera screens don't
  // stay on the stack (otherwise back would walk through them again)
  router.dismissTo({
    pathname: "/chat/[id]",
    params: {
      id: String(conversationId),
      username,
      avatarUrl,
      memberIds: memberIds.join(","),
      messageId: String(messageId),
    },
  });
}
