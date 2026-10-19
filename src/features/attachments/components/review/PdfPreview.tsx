import Pdf from "react-native-pdf";

type Props = { uri: string; onError: () => void };

// Native (iOS / Android) PDF preview. Web uses PdfPreview.web.tsx.
export function PdfPreview({ uri, onError }: Props) {
  return (
    <Pdf
      source={{ uri }}
      style={{ flex: 1, backgroundColor: "#000000" }}
      enableDoubleTapZoom
      onError={onError}
    />
  );
}
