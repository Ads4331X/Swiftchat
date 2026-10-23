export type CallType = "audio" | "video";

export type CallStatus =
  | "outgoing"
  | "incoming"
  | "connecting"
  | "active"
  | "ended"
  | "failed";

export type OngoingCall = {
  callId: string;
  callType: CallType;
  conversationId: number;
  participantId: number;
  participantName: string;
  direction: "incoming" | "outgoing";
  status: CallStatus;
};

export type Call = {
  callerId: number;
  receiversId: number[];
  callType: "audio" | "video";
  status:
    | "Outgoing"
    | "ringing"
    | "connecting"
    | "connected"
    | "ended"
    | "failed";
  startTime: Date;
  mute: boolean;
  camera: boolean;
  callId: number;
};
