import Feather from "@expo/vector-icons/Feather";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BRAND_COLOR } from "@/shared/theme/theme";

import type { OngoingCall } from "../types";
import { useCall } from "../use-call";
import CallAudio from "./CallAudio";
import CallVideo from "./CallVideo";

export default function CallOverlay() {
  const {
    call,
    localStream,
    remoteStream,
    isMuted,
    isSpeakerOn,
    isCameraOn,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
  } = useCall();

  if (!call) return null;

  const isVideo = call.callType === "video";
  const isIncoming = call.direction === "incoming" && call.status === "incoming";

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (isIncoming) {
          void declineCall();
        } else {
          void endCall();
        }
      }}
    >
      <View className="flex-1 bg-[#0B0F10]">
        {isVideo && remoteStream ? (
          <CallVideo
            stream={remoteStream}
            style={StyleSheet.absoluteFill}
            objectFit="cover"
          />
        ) : (
          <View className="absolute inset-0 items-center justify-center">
            {remoteStream ? <CallAudio stream={remoteStream} /> : null}
            <View
              className="h-28 w-28 items-center justify-center rounded-full"
              style={{ backgroundColor: BRAND_COLOR + "33" }}
            >
              <Feather
                name={isVideo ? "video" : "phone"}
                size={46}
                color="#fff"
              />
            </View>
          </View>
        )}

        <SafeAreaView className="absolute inset-x-0 top-0" edges={["top"]}>
          <View className="items-center px-6 pt-4">
            <Text
              numberOfLines={1}
              className="text-[22px] font-bold text-white"
            >
              {call.participantName}
            </Text>
            <Text className="mt-1 text-sm text-white/70">
              {statusText(call)}
            </Text>
          </View>
        </SafeAreaView>

        {isVideo && localStream && isCameraOn ? (
          <View className="absolute right-4 top-24 h-[148px] w-[104px] overflow-hidden rounded-[14px] border border-white/35 bg-[#111]">
            <CallVideo
              stream={localStream}
              style={styles.localVideo}
              objectFit="cover"
              mirror
              muted
              zOrder={1}
            />
          </View>
        ) : null}

        <SafeAreaView className="absolute inset-x-0 bottom-0" edges={["bottom"]}>
          <View className="flex-row items-center justify-center gap-5 px-6 py-5">
            {isIncoming ? (
              <>
                <CallButton
                  icon="phone-off"
                  label="Decline"
                  color="#EF4444"
                  onPress={() => void declineCall()}
                />
                <CallButton
                  icon="phone"
                  label="Accept"
                  color="#22C55E"
                  onPress={() => void acceptCall()}
                />
              </>
            ) : (
              <>
                {localStream ? (
                  <>
                    <CallButton
                      icon={isMuted ? "mic-off" : "mic"}
                      label={isMuted ? "Unmute" : "Mute"}
                      active={isMuted}
                      onPress={toggleMute}
                    />
                    {!isVideo && Platform.OS !== "web" ? (
                      <CallButton
                        icon={isSpeakerOn ? "volume-2" : "volume-1"}
                        label={isSpeakerOn ? "Speaker on" : "Speaker"}
                        active={isSpeakerOn}
                        onPress={toggleSpeaker}
                      />
                    ) : null}
                    {isVideo ? (
                      <CallButton
                        icon={isCameraOn ? "video" : "video-off"}
                        label={isCameraOn ? "Camera off" : "Camera on"}
                        active={!isCameraOn}
                        onPress={toggleVideo}
                      />
                    ) : null}
                  </>
                ) : null}
                <CallButton
                  icon="phone-off"
                  label="End"
                  color="#EF4444"
                  onPress={() => void endCall()}
                />
              </>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function statusText(call: OngoingCall) {
  switch (call.status) {
    case "outgoing":
      return "Ringing…";
    case "incoming":
      return `Incoming ${call.callType} call`;
    case "connecting":
      return "Connecting…";
    case "active":
      return "Connected";
    case "ended":
      return "Call ended";
    case "failed":
      return "Call failed";
    default:
      return "";
  }
}

function CallButton({
  icon,
  label,
  color,
  active = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  color?: string;
  active?: boolean;
  onPress: () => void;
}) {
  const backgroundColor = color ?? (active ? "#fff" : "rgba(255,255,255,0.18)");
  const foregroundColor = color ? "#fff" : active ? "#11181C" : "#fff";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-w-[76px] items-center justify-center gap-1.5 rounded-2xl px-3 py-3"
      style={({ pressed }) => ({
        backgroundColor,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather name={icon} size={24} color={foregroundColor} />
      <Text className="text-xs font-semibold" style={{ color: foregroundColor }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  localVideo: {
    flex: 1,
  },
});
