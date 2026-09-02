/**
 * The microphone capture could never start in production.
 *
 * `RealtimeAudioWorkletCapture` built its AudioWorklet processor from a
 * `blob:` URL. Worklet modules are fetched under `script-src`, not
 * `worker-src`, and the site's policy is `script-src 'self' …` with no
 * `blob:`. Chrome answers "Unable to load a worklet's module." and says
 * nothing else; the start sequence then disconnects the still-connecting
 * realtime socket, whose own error overwrites the real cause in the UI as
 * "The live voice session could not run". Verified 2026-09-02: the identical
 * blob worklet loads on a page without this CSP and fails on the app origin.
 *
 * The processor is now a static same-origin file, which `'self'` admits, and
 * the capture references it by path. Widening `script-src` to `blob:` would
 * also have worked and would have loosened the policy for every script.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REALTIME_CAPTURE_WORKLET_NAME,
  REALTIME_CAPTURE_WORKLET_PATH,
} from "../agents/platform/realtime-audio-capture";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("the capture worklet is a same-origin file", () => {
  test("the file exists under public/ at the referenced path", () => {
    expect(REALTIME_CAPTURE_WORKLET_PATH.startsWith("/")).toBe(true);
    const file = readFileSync(join(REPO_ROOT, "public", REALTIME_CAPTURE_WORKLET_PATH), "utf8");
    expect(file).toContain(`registerProcessor("${REALTIME_CAPTURE_WORKLET_NAME}"`);
    expect(file).toContain("extends AudioWorkletProcessor");
    expect(file).toContain("this.port.postMessage");
  });

  test("the capture loads it by path and builds no blob URL", () => {
    const src = readFileSync(
      join(REPO_ROOT, "src/lib/agents/platform/realtime-audio-capture.ts"),
      "utf8",
    );
    expect(/addModule\(REALTIME_CAPTURE_WORKLET_PATH\)/.test(src)).toBe(true);
    expect(/createObjectURL/.test(src)).toBe(false);
    expect(/new Blob\(/.test(src)).toBe(false);
  });
});

describe("a start failure keeps its own reason", () => {
  test("the socket error raised by our own teardown does not overwrite it", () => {
    // Order in production: capture throws → catch sets the cause → catch
    // disconnects the connecting socket → the socket's onerror fires later →
    // onError set "The live voice session could not run" over the cause.
    const src = readFileSync(
      join(REPO_ROOT, "src/components/dashboard/live-voice-session.tsx"),
      "utf8",
    );
    expect(/const startErrorRef = useRef<string \| null>\(null\)/.test(src)).toBe(true);
    expect(/onError:[\s\S]{0,400}if \(startErrorRef\.current\) return;/.test(src)).toBe(true);
  });
});
