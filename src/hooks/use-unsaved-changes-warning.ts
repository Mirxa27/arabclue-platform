import { useEffect } from "react";
import { registerUnsavedChangesGuard } from "@/lib/unsaved-changes";

/**
 * Warns before the browser discards unsaved editor work on reload, tab close,
 * or navigation away. Client-side route changes do not fire `beforeunload` and
 * are not covered here.
 *
 * `isDirty` is a boolean, so the listener is re-registered only when the editor
 * actually crosses between saved and unsaved — not on every keystroke.
 */
export function useUnsavedChangesWarning(isDirty: boolean): void {
  useEffect(
    () => registerUnsavedChangesGuard(window, () => isDirty),
    [isDirty]
  );
}
