/**
 * Voice + speaking-style options for the live voice agent.
 *
 * Voice names must match each provider exactly (OpenAI Realtime requires all
 * lowercase). Speaking "style" is applied as an instruction suffix because the
 * Realtime API has no dedicated style parameter.
 *
 * OpenAI voices (2026): alloy, ash, ballad, coral, echo, sage, shimmer, verse,
 * marin, cedar — see the Realtime conversations guide.
 */

export type VoiceProviderKind = "openai" | "google";

export type VoiceOption = {
  id: string;
  label: string;
  /** Short EN descriptor for the picker. */
  note?: string;
  noteAr?: string;
};

export const OPENAI_VOICES: VoiceOption[] = [
  { id: "alloy", label: "Alloy", note: "Neutral · balanced", noteAr: "محايد · متوازن" },
  { id: "verse", label: "Verse", note: "Warm · expressive", noteAr: "دافئ · معبّر" },
  { id: "ash", label: "Ash", note: "Calm · grounded", noteAr: "هادئ · متزن" },
  { id: "ballad", label: "Ballad", note: "Soft · gentle", noteAr: "ناعم · لطيف" },
  { id: "coral", label: "Coral", note: "Bright · friendly", noteAr: "مشرق · ودود" },
  { id: "echo", label: "Echo", note: "Deep · steady", noteAr: "عميق · ثابت" },
  { id: "sage", label: "Sage", note: "Measured · clear", noteAr: "متأنٍّ · واضح" },
  { id: "shimmer", label: "Shimmer", note: "Light · crisp", noteAr: "خفيف · واضح" },
  { id: "marin", label: "Marin", note: "Premium · natural", noteAr: "مميّز · طبيعي" },
  { id: "cedar", label: "Cedar", note: "Premium · rich", noteAr: "مميّز · ثري" },
];

// Gemini Live prebuilt voices.
export const GOOGLE_VOICES: VoiceOption[] = [
  { id: "Puck", label: "Puck", note: "Upbeat", noteAr: "حيوي" },
  { id: "Charon", label: "Charon", note: "Deep", noteAr: "عميق" },
  { id: "Kore", label: "Kore", note: "Neutral", noteAr: "محايد" },
  { id: "Fenrir", label: "Fenrir", note: "Bold", noteAr: "جريء" },
  { id: "Aoede", label: "Aoede", note: "Bright", noteAr: "مشرق" },
];

export const DEFAULT_VOICE: Record<VoiceProviderKind, string> = {
  openai: "alloy",
  google: "Puck",
};

export function voicesForProvider(kind: VoiceProviderKind): VoiceOption[] {
  return kind === "google" ? GOOGLE_VOICES : OPENAI_VOICES;
}

/**
 * Validate a requested voice against the provider's list; fall back to default.
 * OpenAI voices are normalized to lowercase (API requirement).
 */
export function resolveVoice(
  kind: VoiceProviderKind,
  requested?: string | null
): string {
  const list = voicesForProvider(kind);
  if (!requested) return DEFAULT_VOICE[kind];
  if (kind === "openai") {
    const lower = requested.toLowerCase();
    return list.some((v) => v.id === lower) ? lower : DEFAULT_VOICE[kind];
  }
  return list.some((v) => v.id === requested)
    ? requested
    : DEFAULT_VOICE[kind];
}

// ─── Speaking styles (applied as instruction suffix) ─────────────────────────

export type VoiceStyle = {
  id: string;
  label: string;
  labelAr: string;
  /** Appended to the agent instructions to shape delivery. */
  instruction: string;
};

export const VOICE_STYLES: VoiceStyle[] = [
  {
    id: "professional",
    label: "Professional",
    labelAr: "احترافي",
    instruction:
      "Speaking style: professional, clear, and confident. Keep replies crisp and business-appropriate.",
  },
  {
    id: "friendly",
    label: "Friendly",
    labelAr: "ودود",
    instruction:
      "Speaking style: warm, friendly, and encouraging — personable but still efficient.",
  },
  {
    id: "concise",
    label: "Concise",
    labelAr: "موجز",
    instruction:
      "Speaking style: extremely concise. Short sentences, no filler, straight to the point.",
  },
  {
    id: "energetic",
    label: "Energetic",
    labelAr: "حماسي",
    instruction:
      "Speaking style: upbeat and energetic delivery while remaining professional.",
  },
  {
    id: "calm",
    label: "Calm",
    labelAr: "هادئ",
    instruction:
      "Speaking style: calm, measured, and reassuring. Unhurried and steady pacing.",
  },
];

export const DEFAULT_STYLE = "professional";

export function isVoiceStyle(id?: string | null): boolean {
  return VOICE_STYLES.some((s) => s.id === id);
}

/** Instruction suffix for a style id, or null when unknown/default-less. */
export function styleInstruction(styleId?: string | null): string | null {
  const style = VOICE_STYLES.find((s) => s.id === styleId);
  return style ? style.instruction : null;
}
