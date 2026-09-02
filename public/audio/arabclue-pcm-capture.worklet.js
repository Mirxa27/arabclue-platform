// Mic capture processor for the live voice session.
//
// A static same-origin file on purpose: worklet modules are fetched under the
// page's `script-src`, which is `'self'` here, so a `blob:` module (the
// previous approach) was refused by the browser with "Unable to load a
// worklet's module" and the live session could never start.
//
// Keep the registered name in step with REALTIME_CAPTURE_WORKLET_NAME in
// src/lib/agents/platform/realtime-audio-capture.ts.
class ArabCluePcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      // Copy — AudioWorklet reuses the underlying buffer across callbacks.
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}
registerProcessor("arabclue-pcm-capture", ArabCluePcmCaptureProcessor);
