/**
 * `window.localStorage`, or `null` when there isn't one to reach.
 *
 * Two callers need this and both got it wrong-by-omission at least once: the
 * check is not `typeof window === "undefined"` alone. Safari in private mode
 * and any origin the user has denied storage throw on the *property access*
 * itself, before `getItem` is ever called, so reading it has to be guarded too.
 *
 * Returning `null` rather than throwing keeps the decision with the caller,
 * which in every current case is "then this feature simply does not persist".
 */
export type WebStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function browserStorage(): WebStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
