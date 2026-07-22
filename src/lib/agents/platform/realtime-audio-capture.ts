/**
 * Mic capture for OpenAI/Gemini realtime via AudioWorkletNode.
 * Replaces AI SDK BrowserRealtimeAudio's deprecated ScriptProcessorNode path.
 */

import {
  experimental_encodeRealtimeAudio as encodeRealtimeAudio,
  experimental_resampleAudio as resampleAudio,
} from "ai";

const WORKLET_NAME = "arabclue-pcm-capture";

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
      this.onAudio(encodeRealtimeAudio(samples));
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
