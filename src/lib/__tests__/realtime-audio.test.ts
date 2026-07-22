import { describe, expect, test } from "bun:test";
import {
  experimental_encodeRealtimeAudio,
  experimental_resampleAudio,
} from "ai";
import { RealtimePcmBatcher } from "@/lib/agents/platform/realtime-audio-capture";
import { getLiveVoiceSessionConfig } from "@/lib/agents/platform/realtime-session-config";

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

  test("reuses one immutable session config across renders", () => {
    const first = getLiveVoiceSessionConfig();
    expect(first).toBe(getLiveVoiceSessionConfig());
    expect(Object.isFrozen(first)).toBe(true);
  });

  test("batches worklet quanta into SDK-sized audio chunks", () => {
    const batcher = new RealtimePcmBatcher();
    for (let index = 0; index < 31; index += 1) {
      expect(batcher.push(new Float32Array(128))).toHaveLength(0);
    }
    const chunks = batcher.push(new Float32Array(128));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(4_096);
  });

  test("preserves sample order across batched worklet frames", () => {
    const batcher = new RealtimePcmBatcher(8);
    expect(batcher.push(new Float32Array([0, 1, 2]))).toEqual([]);
    const first = batcher.push(new Float32Array([3, 4, 5, 6, 7, 8, 9]));
    expect(first).toHaveLength(1);
    expect([...first[0]]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const second = batcher.push(new Float32Array([10, 11, 12, 13, 14, 15]));
    expect(second).toHaveLength(1);
    expect([...second[0]]).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
  });
});
