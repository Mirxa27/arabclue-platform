const DEFAULT_RANDOM_SEED = 0x6d2b79f5;

export class DeterministicClock {
  private currentMilliseconds: number;

  constructor(initialInstant: Date | string | number = "2026-01-01T00:00:00.000Z") {
    const milliseconds = new Date(initialInstant).getTime();
    if (!Number.isFinite(milliseconds)) {
      throw new TypeError("DeterministicClock requires a valid initial instant");
    }
    this.currentMilliseconds = milliseconds;
  }

  readonly now = (): Date => new Date(this.currentMilliseconds);

  advanceBy(milliseconds: number): Date {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
      throw new TypeError("Clock advances must be non-negative safe integers");
    }
    this.currentMilliseconds += milliseconds;
    return this.now();
  }

  set(instant: Date | string | number): Date {
    const milliseconds = new Date(instant).getTime();
    if (!Number.isFinite(milliseconds)) {
      throw new TypeError("DeterministicClock requires a valid instant");
    }
    this.currentMilliseconds = milliseconds;
    return this.now();
  }
}

/** Stable test-only byte/UUID source for injectable randomness boundaries. */
export class DeterministicRandomSource {
  private state: number;

  constructor(seed = DEFAULT_RANDOM_SEED) {
    if (!Number.isSafeInteger(seed)) {
      throw new TypeError("DeterministicRandomSource seed must be a safe integer");
    }
    this.state = (seed >>> 0) || DEFAULT_RANDOM_SEED;
  }

  private nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  readonly bytes = (size: number): Uint8Array => {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new TypeError("Random byte size must be a non-negative safe integer");
    }

    const output = new Uint8Array(size);
    let word = 0;
    for (let index = 0; index < size; index += 1) {
      if (index % 4 === 0) word = this.nextUint32();
      output[index] = (word >>> ((index % 4) * 8)) & 0xff;
    }
    return output;
  };

  readonly randomBytes = (size: number): Buffer => Buffer.from(this.bytes(size));

  readonly randomUUID = (): string => {
    const bytes = this.bytes(16);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  };
}
