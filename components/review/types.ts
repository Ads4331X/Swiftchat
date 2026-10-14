export type ReviewAsset = {
  uri: string;
  type?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
};

export type SendImage = {
  uri: string;
  width?: number | null;
  height?: number | null;
  size?: number | null;
};

export type SendVideo = {
  uri: string;
  width?: number | null;
  height?: number | null;
  size?: number | null;
  mimeType?: string | null;
};
