export function useAttachmentCameraPermission() {
  return {
    hasPermission: false,
    canRequestPermission: false,
    requestPermission: async () => false,
  };
}
