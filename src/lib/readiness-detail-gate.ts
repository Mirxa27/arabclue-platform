/**
 * Who may read the full `/api/ready` report.
 *
 * The probe is public so a load balancer can poll it, but the detailed body
 * names unapplied migrations, the credential map per AI engine, the storage
 * and rate-limit backends, and whether each secret is set. Strangers get the
 * boolean; the detail goes to a caller holding `CRON_SECRET` (the same secret
 * the cron plane trusts, sent as `x-readiness-token`) or to a signed-in
 * platform administrator (the admin overview card polls from the browser).
 */

import { secretsMatch } from "./cron-auth";

export const READINESS_TOKEN_HEADER = "x-readiness-token";

/** Shortest CRON_SECRET the cron plane accepts; the same floor applies here. */
const MIN_SECRET_LENGTH = 16;

const DETAIL_ROLES: ReadonlySet<string> = new Set(["ADMIN", "SUPER_ADMIN"]);

/** True when the header token equals a configured, long-enough CRON_SECRET. */
export function readinessTokenAuthorizes(
  token: string | null | undefined,
  cronSecret: string | undefined,
): boolean {
  const candidate = token?.trim() ?? "";
  const expected = cronSecret?.trim() ?? "";
  if (!candidate || expected.length < MIN_SECRET_LENGTH) return false;
  return secretsMatch(candidate, expected);
}

/** Platform administrators may read the detailed report from the browser. */
export function roleMayViewReadinessDetails(
  role: string | null | undefined,
): boolean {
  return typeof role === "string" && DETAIL_ROLES.has(role);
}

export type PublicReadinessBody = Readonly<{
  ready: boolean;
  service: string;
  time: string;
}>;

/** The three fields an anonymous caller receives. Nothing else. */
export function publicReadinessBody(
  report: Readonly<{ ready: boolean; service: string; time: string }>,
): PublicReadinessBody {
  return Object.freeze({
    ready: report.ready,
    service: report.service,
    time: report.time,
  });
}
