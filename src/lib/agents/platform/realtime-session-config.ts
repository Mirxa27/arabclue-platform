import type { Experimental_RealtimeSessionConfig } from "ai";

const LIVE_VOICE_SESSION_CONFIG = Object.freeze({
  instructions: undefined,
  inputAudioTranscription: {},
  voice: "alloy",
  turnDetection: { type: "server-vad" as const },
}) satisfies Readonly<Partial<Experimental_RealtimeSessionConfig>>;

/**
 * Client session config for the live voice hook. The SDK re-applies this via a
 * `session-update` on connect, so `voice` is authoritative here. Pass the
 * selected voice to switch it; omitting (or passing the default) reuses the
 * frozen singleton so referential identity is preserved across renders.
 */
export function getLiveVoiceSessionConfig(
  voice?: string
): Readonly<Partial<Experimental_RealtimeSessionConfig>> {
  if (!voice || voice === LIVE_VOICE_SESSION_CONFIG.voice) {
    return LIVE_VOICE_SESSION_CONFIG;
  }
  return Object.freeze({
    ...LIVE_VOICE_SESSION_CONFIG,
    voice,
  }) satisfies Readonly<Partial<Experimental_RealtimeSessionConfig>>;
}
