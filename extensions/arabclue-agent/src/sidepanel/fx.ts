/** Minimal particle FX for side panel (kept from original, simplified) */

export function initFx(stage: HTMLElement): void {
  const orb = stage.querySelector(".orb") as HTMLElement | null;
  if (!orb) return;

  // Pulse the orb when scanning
  const observer = new MutationObserver(() => {
    const isScanning = stage.querySelector("#btnStop:not(.hidden)") !== null;
    orb.style.animationDuration = isScanning ? "1.1s" : "2.4s";
    orb.style.boxShadow = isScanning
      ? "0 0 24px rgba(45, 212, 191, 0.8)"
      : "0 0 16px rgba(34, 211, 238, 0.4)";
  });

  observer.observe(stage, { subtree: true, attributes: true, childList: true });
}
