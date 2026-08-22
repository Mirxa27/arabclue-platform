const SECRET_KEYS = [
  "passwordHash",
  "mfaSecret",
  "pendingMfaSecret",
  "mfaLastUsedStep",
] as const;

export function toPublicAdminUser<T extends Record<string, unknown>>(user: T) {
  const copy = { ...user };
  for (const key of SECRET_KEYS) {
    delete copy[key];
  }
  return copy;
}
