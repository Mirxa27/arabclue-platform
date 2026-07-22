export type VoiceLiveProviderKind = "openai" | "google";

export type VoiceLiveConfig = {
  enabled: true;
  provider: VoiceLiveProviderKind;
  providerLabel: string;
  connectionName: string;
  modelId: string;
  engine: "VOICE";
};

export type VoiceLiveConfigResponse =
  | VoiceLiveConfig
  | { enabled: false; reason: string };
