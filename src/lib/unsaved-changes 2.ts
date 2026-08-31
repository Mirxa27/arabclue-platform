/**
 * Browser-native "leave site?" prompt for editors with unsaved work.
 *
 * This only covers full page unloads — reload, tab close, and navigation to an
 * external URL. App Router client-side navigation never fires `beforeunload`,
 * so in-app view switches need their own confirmation.
 */

interface UnloadEventLike {
  preventDefault: () => void;
  returnValue: unknown;
}

type UnloadListener = (event: UnloadEventLike) => void;

interface UnloadTarget {
  addEventListener(type: "beforeunload", fn: UnloadListener): void;
  removeEventListener(type: "beforeunload", fn: UnloadListener): void;
}

/**
 * Installs the guard and returns its cleanup. `isDirty` is read at unload time
 * rather than captured, so the caller registers once instead of re-registering
 * on every keystroke.
 */
export function registerUnsavedChangesGuard(
  target: UnloadTarget,
  isDirty: () => boolean
): () => void {
  const onBeforeUnload = (event: UnloadEventLike) => {
    if (!isDirty()) return;
    event.preventDefault();
    // Chrome and Safari still gate the prompt on a set returnValue.
    event.returnValue = "";
  };

  target.addEventListener("beforeunload", onBeforeUnload);
  return () => target.removeEventListener("beforeunload", onBeforeUnload);
}
