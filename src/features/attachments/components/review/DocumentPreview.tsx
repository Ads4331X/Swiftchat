import { useState } from "react";
import { Keyboard, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { formatFileSize } from "@/features/attachments/components/attachment/utils";
import { PdfPreview } from "./PdfPreview";

// WhatsApp-style: review is always dark, regardless of app theme.
const TEXT = "#FFFFFF";
const SUBTEXT = "#8696A0";
const CARD = "#1F2C34";

type Props = {
  name?: string;
  mimeType?: string;
  size?: number;
  uri?: string;
  onBack: () => void;
};

/**
 * Document review: back button with file name, then a real PDF
 * preview — or a plain file tile when there is no preview available.
 */
export function DocumentPreview({
  name = "Document",
  mimeType = "",
  size = 0,
  uri,
  onBack,
}: Props) {
  const [failed, setFailed] = useState(false);

  const ext = name.includes(".") ? name.split(".").pop() : undefined;
  const label = (ext || mimeType.split("/")[1] || "file")
    .slice(0, 5)
    .toUpperCase();
  const isPdf =
    mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf");

  return (
    <View style={{ flex: 1 }}>
      {/* Header: back button with file name and size beside it. */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 8,
          paddingVertical: 8,
        }}
      >
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{ padding: 8 }}
        >
          <Feather name="arrow-left" size={24} color={TEXT} />
        </Pressable>

        <View style={{ flex: 1, marginLeft: 4 }}>
          <Text
            numberOfLines={1}
            ellipsizeMode="middle"
            style={{ color: TEXT, fontSize: 16, fontWeight: "600" }}
          >
            {name}
          </Text>
          <Text style={{ color: SUBTEXT, fontSize: 13, marginTop: 2 }}>
            {label} · {formatFileSize(size)}
          </Text>
        </View>
      </View>

      {/* Tapping the preview dismisses the keyboard. */}
      <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss}>
        {isPdf && uri && !failed ? (
          <PdfPreview uri={uri} onError={() => setFailed(true)} />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 24,
            }}
          >
            <View
              style={{
                width: 120,
                height: 120,
                borderRadius: 28,
                backgroundColor: CARD,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="file-text" size={48} color={TEXT} />
              <Text
                style={{
                  color: SUBTEXT,
                  fontSize: 12,
                  fontWeight: "700",
                  letterSpacing: 1,
                  marginTop: 8,
                }}
              >
                {label}
              </Text>
            </View>

            <Text style={{ color: SUBTEXT, fontSize: 14, marginTop: 20 }}>
              No preview available
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
