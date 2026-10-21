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
