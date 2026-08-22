import { db } from "./db";
import { verifyMfaTokenDetailed } from "./mfa";
import { classifyMfaToken, hashRecoveryCode } from "./mfa-recovery";
import {
  mfaSecretNeedsReseal,
  sealMfaSecret,
  unsealMfaSecret,
} from "./mfa-secret";

export type MfaChallengeOutcome =
  | Readonly<{ ok: true; method: "totp" | "recovery"; step?: number }>
  | Readonly<{ ok: false; reason: "invalid" | "replay" | "missing_secret" }>;

export async function consumeMfaChallenge(opts: {
  userId: string;
  storedSecret: string | null | undefined;
  lastUsedStep: bigint | null | undefined;
  token: string;
}): Promise<MfaChallengeOutcome> {
  const kind = classifyMfaToken(opts.token);
  if (kind === "totp") {
    const plain = unsealMfaSecret(opts.storedSecret);
    if (!plain) return { ok: false, reason: "missing_secret" };
    const evaluated = verifyMfaTokenDetailed(plain, opts.token, {
      lastUsedStep: opts.lastUsedStep ?? null,
    });
    if (!evaluated.ok) return evaluated;
    const persisted = await db.user.updateMany({
      where: {
        id: opts.userId,
        OR: [
          { mfaLastUsedStep: null },
          { mfaLastUsedStep: { lt: BigInt(evaluated.step) } },
        ],
      },
      data: {
        mfaLastUsedStep: BigInt(evaluated.step),
        ...(mfaSecretNeedsReseal(opts.storedSecret)
          ? { mfaSecret: sealMfaSecret(plain) }
          : {}),
      },
    });
    if (persisted.count !== 1) return { ok: false, reason: "replay" };
    return { ok: true, method: "totp", step: evaluated.step };
  }

  if (kind === "recovery") {
    const consumed = await db.mfaRecoveryCode.updateMany({
      where: {
        userId: opts.userId,
        codeHash: hashRecoveryCode(opts.userId, opts.token),
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) return { ok: false, reason: "invalid" };
    return { ok: true, method: "recovery" };
  }

  return { ok: false, reason: "invalid" };
}

export async function replaceRecoveryCodes(
  userId: string,
  codes: readonly string[]
): Promise<void> {
  await db.$transaction([
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
    db.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({
        userId,
        codeHash: hashRecoveryCode(userId, code),
      })),
    }),
  ]);
}
