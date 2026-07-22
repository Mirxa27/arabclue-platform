/**
 * Mic capture for OpenAI/Gemini realtime via AudioWorkletNode.
 * Replaces AI SDK BrowserRealtimeAudio's deprecated ScriptProcessorNode path.
 */

import {
  experimental_encodeRealtimeAudio as encodeRealtimeAudio,
  experimental_resampleAudio as resampleAudio,
} from "ai";

const WORKLET_NAME = "arabclue-pcm-capture";
// Match the AI SDK browser capture buffer: ~171 ms per chunk at 24 kHz.
const SDK_CAPTURE_BATCH_SAMPLES = 4_096;

const WORKLET_SOURCE = `
class ArabCluePcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      // Copy — AudioWorklet reuses the underlying buffer across callbacks.
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', ArabCluePcmCaptureProcessor);
`;

let workletModuleUrl: string | null = null;

function getWorkletModuleUrl(): string {
  if (!workletModuleUrl) {
    const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
    workletModuleUrl = URL.createObjectURL(blob);
  }
  return workletModuleUrl;
}

export type RealtimeAudioWorkletCaptureOptions = {
  /** Target PCM rate for the realtime provider (OpenAI default 24 kHz). */
  targetSampleRate?: number;
  onAudio: (base64Pcm16: string) => void;
};

export class RealtimePcmBatcher {
  private readonly batchSamples: number;
  private pending = new Float32Array(0);

  constructor(batchSamples = SDK_CAPTURE_BATCH_SAMPLES) {
    if (!Number.isInteger(batchSamples) || batchSamples <= 0) {
      throw new RangeError("batchSamples must be a positive integer");
    }
    this.batchSamples = batchSamples;
  }

  push(samples: Float32Array): Float32Array[] {
    if (samples.length === 0) return [];

    const batches: Float32Array[] = [];
    let offset = 0;

    if (this.pending.length > 0) {
      const needed = this.batchSamples - this.pending.length;
      if (samples.length < needed) {
        const nextPending = new Float32Array(
          this.pending.length + samples.length
        );
        nextPending.set(this.pending);
        nextPending.set(samples, this.pending.length);
        this.pending = nextPending;
        return batches;
      }

      const batch = new Float32Array(this.batchSamples);
      batch.set(this.pending);
      batch.set(samples.subarray(0, needed), this.pending.length);
      batches.push(batch);
      this.pending = new Float32Array(0);
      offset = needed;
    }

    while (offset + this.batchSamples <= samples.length) {
      batches.push(samples.slice(offset, offset + this.batchSamples));
      offset += this.batchSamples;
    }

    if (offset < samples.length) {
      this.pending = samples.slice(offset);
    }

    return batches;
  }

  reset(): void {
    this.pending = new Float32Array(0);
  }
}

/**
 * Captures a MediaStream with AudioWorklet, resamples to the realtime rate,
 * encodes PCM16, and invokes onAudio with base64 chunks for sendAudio().
 */
export class RealtimeAudioWorkletCapture {
  private readonly targetSampleRate: number;
  private readonly onAudio: (base64Pcm16: string) => void;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private silentGain: GainNode | null = null;
  private stream: MediaStream | null = null;
  private readonly batcher = new RealtimePcmBatcher();
  private running = false;

  constructor(options: RealtimeAudioWorkletCaptureOptions) {
    this.targetSampleRate = options.targetSampleRate ?? 24_000;
    this.onAudio = options.onAudio;
  }

  get isCapturing(): boolean {
    return this.running;
  }

  async start(stream: MediaStream): Promise<void> {
    await this.stop();

    const context = new AudioContext({ sampleRate: this.targetSampleRate });
    await context.audioWorklet.addModule(getWorkletModuleUrl());

    const source = context.createMediaStreamSource(stream);
    const worklet = new AudioWorkletNode(context, WORKLET_NAME);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
      const input = event.data;
      if (!input?.length) return;
      const samples = resampleAudio(
        input,
        context.sampleRate,
        this.targetSampleRate
      );
      if (!samples.length) return;
      for (const batch of this.batcher.push(samples)) {
        this.onAudio(encodeRealtimeAudio(batch));
      }
    };

    source.connect(worklet);
    // Keep the graph alive without audible monitor output.
    worklet.connect(silentGain);
    silentGain.connect(context.destination);

    if (context.state === "suspended") {
      await context.resume();
    }

    this.context = context;
    this.source = source;
    this.worklet = worklet;
    this.silentGain = silentGain;
    this.stream = stream;
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.batcher.reset();

    try {
      this.worklet?.port.close();
    } catch {
      /* ignore */
    }
    try {
      this.worklet?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.source?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.silentGain?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        /* ignore */
      }
    }

    this.worklet = null;
    this.source = null;
    this.silentGain = null;
    this.context = null;
    this.stream = null;
  }
}
