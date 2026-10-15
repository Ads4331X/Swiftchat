import { getDb } from "./connection";

type Attachment = {
  id: number;
  uuid: string;
  messageId: number;
  localPath: string | null;
  mimeType: string;
  fileSize: number;
  encryptedKey: string;
  keyNonce: string;
  encryptedHeader: string;
  headerNonce: string;
  uploadStatus: string;
  downloadStatus: string;
};

type CreateAttachmentParams = {
  uuid: string;
  messageId: number;
  localPath: string | null;
  mimeType: string;
  fileSize: number;
  encryptedKey: string;
  encryptedHeader: string;
  keyNonce: string;
  headerNonce: string;
};

const ATTACHMENT_CREATE_SQL = `
  INSERT INTO Attachment (
    uuid,
    messageId,
    localPath,
    mimeType,
    fileSize,
    encryptedKey,
    encryptedHeader,
    headerNonce,
    keyNonce
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

const ATTACHMENT_CREATE_PARAMS = ({
  uuid,
  messageId,
  localPath,
  mimeType,
  fileSize,
  encryptedKey,
  encryptedHeader,
  headerNonce,
  keyNonce,
}: CreateAttachmentParams) => [
  uuid,
  messageId,
  localPath,
  mimeType,
  fileSize,
  encryptedKey,
  encryptedHeader,
  headerNonce,
  keyNonce,
];

export async function createAttachment(params: CreateAttachmentParams) {
  try {
    const db = await getDb();
    if (!db) return;

    await db.runAsync(ATTACHMENT_CREATE_SQL, ATTACHMENT_CREATE_PARAMS(params));
  } catch (err) {
    console.warn("createAttachment skipped:", err);
  }
}

export async function getAttachment({ messageId }: { messageId: number }) {
  try {
    const db = await getDb();
    if (!db) return null;

    return await db.getFirstAsync<Attachment>(
      `SELECT * FROM Attachment WHERE messageId = ?`,
      [messageId],
    );
  } catch (err) {
    console.warn("getAttachment skipped:", err);
    return null;
  }
}

export async function updateLocalPath({
  localPath,
  messageId,
}: {
  messageId: number;
  localPath: string;
}) {
  try {
    const db = await getDb();
    if (!db) return null;

    return await db.runAsync(
      `UPDATE Attachment
       SET localPath = ?
       WHERE messageId = ?;`,
      [localPath, messageId],
    );
  } catch (err) {
    console.warn("updateLocalPath skipped:", err);
    return null;
  }
}

export async function hasAttachment({ messageId }: { messageId: number }) {
  const attachment = await getAttachment({ messageId });
  return attachment !== null;
}
