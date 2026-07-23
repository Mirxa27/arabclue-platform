import { describe, expect, test } from "bun:test";
import {
  DEFAULT_STYLE,
  DEFAULT_VOICE,
  OPENAI_VOICES,
  VOICE_STYLES,
  isVoiceStyle,
  resolveVoice,
  styleInstruction,
  voicesForProvider,
} from "@/lib/agents/platform/voice-options";
import { getLiveVoiceSessionConfig } from "@/lib/agents/platform/realtime-session-config";

describe("voice options", () => {
  test("openai voice list matches the documented set (lowercase)", () => {
    const ids = OPENAI_VOICES.map((v) => v.id);
    for (const v of [
      "alloy",
      "ash",
      "ballad",
      "coral",
      "echo",
      "sage",
      "shimmer",
      "verse",
      "marin",
      "cedar",
    ]) {
      expect(ids).toContain(v);
    }
    expect(ids.every((id) => id === id.toLowerCase())).toBe(true);
  });

  test("resolveVoice validates and lowercases for openai", () => {
    expect(resolveVoice("openai", "VERSE")).toBe("verse");
    expect(resolveVoice("openai", "shimmer")).toBe("shimmer");
    expect(resolveVoice("openai", "nonexistent")).toBe(DEFAULT_VOICE.openai);
    expect(resolveVoice("openai", null)).toBe(DEFAULT_VOICE.openai);
  });

  test("resolveVoice validates google voices", () => {
    expect(resolveVoice("google", "Kore")).toBe("Kore");
    expect(resolveVoice("google", "bogus")).toBe(DEFAULT_VOICE.google);
  });

  test("voicesForProvider returns provider-specific list", () => {
    expect(voicesForProvider("openai")).toBe(OPENAI_VOICES);
    expect(voicesForProvider("google").length).toBeGreaterThan(0);
  });
});

describe("voice styles", () => {
  test("default style resolves to an instruction", () => {
    expect(isVoiceStyle(DEFAULT_STYLE)).toBe(true);
    const instr = styleInstruction(DEFAULT_STYLE);
    expect(instr).toBeTruthy();
    expect(instr).toContain("Speaking style");
  });

  test("unknown style yields null", () => {
    expect(styleInstruction("banana")).toBeNull();
    expect(isVoiceStyle("banana")).toBe(false);
  });

  test("concise style stays terse", () => {
    const s = VOICE_STYLES.find((v) => v.id === "concise");
    expect(s?.instruction.toLowerCase()).toContain("concise");
  });
});

describe("live voice session config voice override", () => {
  test("no-arg returns the frozen singleton (stable identity)", () => {
    expect(getLiveVoiceSessionConfig()).toBe(getLiveVoiceSessionConfig());
    expect(Object.isFrozen(getLiveVoiceSessionConfig())).toBe(true);
  });

  test("default voice reuses the singleton", () => {
    expect(getLiveVoiceSessionConfig("alloy")).toBe(getLiveVoiceSessionConfig());
  });

  test("custom voice yields a new frozen config", () => {
    const cfg = getLiveVoiceSessionConfig("verse");
    expect(cfg).not.toBe(getLiveVoiceSessionConfig());
    expect(cfg.voice).toBe("verse");
    expect(Object.isFrozen(cfg)).toBe(true);
  });
});
