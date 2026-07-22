import { describe, expect, test } from "bun:test";
import {
  experimental_encodeRealtimeAudio,
  experimental_resampleAudio,
} from "ai";

describe("realtime audio encode path", () => {
  test("encodes float32 silence to base64 pcm16", () => {
    const samples = new Float32Array(8);
    const encoded = experimental_encodeRealtimeAudio(samples);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);
    const binary = atob(encoded);
    expect(binary.length).toBe(16); // 8 samples * 2 bytes
  });

  test("resamples 48k voice chunk toward 24k", () => {
    const input = new Float32Array(480);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin(i / 20);
    const out = experimental_resampleAudio(input, 48_000, 24_000);
    expect(out.length).toBe(240);
  });
});
