export type IdentityRuntimeEnvironment = {
  readonly NODE_ENV?: string;
  readonly VERCEL?: string;
};

const RESERVED_DEVELOPMENT_DOMAIN = "@arabclue.local";

export function isProductionRuntime(
  env: IdentityRuntimeEnvironment = process.env
): boolean {
  return env.NODE_ENV === "production" || Boolean(env.VERCEL);
}

export function isReservedDevelopmentIdentity(email: string): boolean {
  return email.trim().toLowerCase().endsWith(RESERVED_DEVELOPMENT_DOMAIN);
}

/** Reserved development identities are never valid in a production runtime. */
export function isProductionBlockedDevelopmentIdentity(
  email: string,
  env: IdentityRuntimeEnvironment = process.env
): boolean {
  return isProductionRuntime(env) && isReservedDevelopmentIdentity(email);
}
