/** Minimal ambient FX for the side panel */

export function initFx(stage: HTMLElement | null): void {
  if (!stage) return;
  const orb = stage.querySelector(".orb") as HTMLElement | null;
  if (!orb) return;

  const pulse = stage.querySelector("#pulse") as HTMLElement | null;

  const observer = new MutationObserver(() => {
    const isScanning = stage.querySelector("#btnStop:not(.hidden)") !== null;
    const isBusy =
      isScanning ||
      /Scanning|Capturing|Preparing|يفحص|يلتقط|يحضّر/i.test(
        stage.querySelector("#statusTitle")?.textContent || ""
      );

    orb.style.animationDuration = isBusy ? "1.1s" : "2.4s";
    orb.style.boxShadow = isBusy
      ? "0 0 24px rgba(45, 212, 191, 0.8)"
      : "0 0 16px rgba(34, 211, 238, 0.4)";

    if (pulse) {
      pulse.style.background = isBusy ? "var(--amber)" : "var(--emerald)";
      pulse.style.boxShadow = isBusy
        ? "0 0 10px var(--amber)"
        : "0 0 8px var(--emerald)";
    }
  });

  observer.observe(stage, { subtree: true, attributes: true, childList: true, characterData: true });

  // Soft parallax on pointer move
  stage.addEventListener(
    "pointermove",
    (ev) => {
      const rect = stage.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / rect.width - 0.5;
      const y = (ev.clientY - rect.top) / rect.height - 0.5;
      orb.style.transform = `translate(${x * 4}px, ${y * 3}px)`;
    },
    { passive: true }
  );
}
