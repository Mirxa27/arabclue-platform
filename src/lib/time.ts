export interface UtcClock {
  /** Return the current instant. Callers receive a defensive copy. */
  now(): Date;
}

export type Clock = UtcClock;

export const systemUtcClock: UtcClock = Object.freeze({
  now: () => new Date(),
});

export function fixedUtcClock(instant: Date | string | number): UtcClock {
  const fixed = toValidDate(instant, "fixed clock instant");
  return Object.freeze({ now: () => new Date(fixed.getTime()) });
}

export function utcNow(clock: UtcClock = systemUtcClock): Date {
  return toValidDate(clock.now(), "clock result");
}

export function addUtcMilliseconds(
  instant: Date,
  milliseconds: number
): Date {
  const start = toValidDate(instant, "start instant");
  if (!Number.isSafeInteger(milliseconds)) {
    throw new RangeError("UTC duration must be a safe integer number of milliseconds.");
  }
  const timestamp = start.getTime() + milliseconds;
  if (!Number.isSafeInteger(timestamp)) {
    throw new RangeError("UTC instant is outside the supported range.");
  }
  return toValidDate(timestamp, "result instant");
}

export function utcDeadline(
  milliseconds: number,
  clock: UtcClock = systemUtcClock
): Date {
  if (milliseconds < 0) {
    throw new RangeError("UTC deadline duration cannot be negative.");
  }
  return addUtcMilliseconds(utcNow(clock), milliseconds);
}

export function isExpired(
  expiresAt: Date,
  clock: UtcClock = systemUtcClock
): boolean {
  return toValidDate(expiresAt, "expiry instant").getTime() <= utcNow(clock).getTime();
}

function toValidDate(value: Date | string | number, label: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError(`Invalid ${label}.`);
  }
  return date;
}
