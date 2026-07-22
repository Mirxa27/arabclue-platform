import type { Experimental_RealtimeSessionConfig } from "ai";

const LIVE_VOICE_SESSION_CONFIG = Object.freeze({
  instructions: undefined,
  inputAudioTranscription: {},
  voice: "alloy",
  turnDetection: { type: "server-vad" as const },
}) satisfies Readonly<Partial<Experimental_RealtimeSessionConfig>>;

export function getLiveVoiceSessionConfig(): Readonly<
  Partial<Experimental_RealtimeSessionConfig>
> {
  return LIVE_VOICE_SESSION_CONFIG;
}
