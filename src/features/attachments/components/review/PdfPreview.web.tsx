type Props = { uri: string; onError: () => void };

// Web PDF preview. The URL fragment asks the browser's built-in viewer to
// hide its toolbar (download / print). Chrome and Edge respect it; other
// browsers may still show some controls.
export function PdfPreview({ uri }: Props) {
  return (
    <iframe
      src={`${uri}#toolbar=0&navpanes=0&view=FitH`}
      title="PDF preview"
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        backgroundColor: "#ffffff",
      }}
    />
  );
}
