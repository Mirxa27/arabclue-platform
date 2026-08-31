/**
 * The editors (proposal editor, proposal builder, contract studio) all track an
 * `isDirty` flag but nothing stopped the browser from discarding that work on a
 * reload, a tab close, or a link out. This is the guard behind that flag.
 *
 * The logic lives in a plain function rather than inside the hook so it can be
 * exercised without a DOM: the test runner has no jsdom, and the repo should not
 * grow a rendering dependency just to assert two `addEventListener` calls.
 */

import { describe, expect, test } from "bun:test";
import { registerUnsavedChangesGuard } from "../unsaved-changes";

type Listener = (event: unknown) => void;

function fakeTarget() {
  const listeners: Array<{ type: string; fn: Listener }> = [];
  return {
    listeners,
    addEventListener(type: string, fn: Listener) {
      listeners.push({ type, fn });
    },
    removeEventListener(type: string, fn: Listener) {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
}

function fakeEvent() {
  return {
    prevented: 0,
    returnValue: undefined as unknown,
    preventDefault() {
      this.prevented += 1;
    },
  };
}

describe("registerUnsavedChangesGuard", () => {
  test("registers a single beforeunload listener", () => {
    const target = fakeTarget();

    registerUnsavedChangesGuard(target, () => true);

    expect(target.listeners).toHaveLength(1);
    expect(target.listeners[0].type).toBe("beforeunload");
  });

  test("blocks the unload while there are unsaved changes", () => {
    const target = fakeTarget();
    registerUnsavedChangesGuard(target, () => true);
    const event = fakeEvent();

    target.listeners[0].fn(event);

    expect(event.prevented).toBe(1);
    // Chrome and Safari still gate the prompt on a set returnValue.
    expect(event.returnValue).toBe("");
  });

  test("lets the unload through when everything is saved", () => {
    const target = fakeTarget();
    registerUnsavedChangesGuard(target, () => false);
    const event = fakeEvent();

    target.listeners[0].fn(event);

    expect(event.prevented).toBe(0);
    expect(event.returnValue).toBeUndefined();
  });

  // The listener is registered once and reads dirtiness on each event, so a
  // keystroke does not churn addEventListener/removeEventListener.
  test("reads the current dirty state at unload time, not at registration", () => {
    const target = fakeTarget();
    let dirty = false;
    registerUnsavedChangesGuard(target, () => dirty);

    const clean = fakeEvent();
    target.listeners[0].fn(clean);
    expect(clean.prevented).toBe(0);

    dirty = true;
    const edited = fakeEvent();
    target.listeners[0].fn(edited);
    expect(edited.prevented).toBe(1);

    expect(target.listeners).toHaveLength(1);
  });

  test("cleanup removes the listener it installed", () => {
    const target = fakeTarget();

    const cleanup = registerUnsavedChangesGuard(target, () => true);
    cleanup();

    expect(target.listeners).toHaveLength(0);
  });

  test("cleanup of one guard leaves another guard's listener installed", () => {
    const target = fakeTarget();

    const cleanupA = registerUnsavedChangesGuard(target, () => true);
    registerUnsavedChangesGuard(target, () => true);
    cleanupA();

    expect(target.listeners).toHaveLength(1);
  });
});
