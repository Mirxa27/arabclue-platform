/**
 * Three of the four invitation endpoints had no caller.
 *
 * `POST /api/invitations`, `GET /api/invitations` and
 * `DELETE /api/invitations/[id]` were complete — service, audit, email,
 * seat check — and reachable from nowhere in the product; only the accept
 * page existed, waiting for a token nothing could issue. The translation
 * keys for the panel (`invitation_list_title`, `invitation_revoke_action`…)
 * were already in the dictionary. This is the panel, in Settings, for
 * workspace managers; the test turns the orphan finding into a ratchet.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tr } from "../i18n";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const PANEL = "src/components/dashboard/team-invitations-panel.tsx";
function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("the team panel reaches every invitation endpoint", () => {
  const src = read(PANEL);
  test("lists, creates and revokes through the existing routes", () => {
    expect(/"\/api\/invitations"/.test(src)).toBe(true);
    expect(/method:\s*"POST"/.test(src)).toBe(true);
    expect(/`\/api\/invitations\/\$\{/.test(src)).toBe(true);
    expect(/method:\s*"DELETE"/.test(src)).toBe(true);
  });
  test("speaks the dictionary, not literals", () => {
    for (const key of ["invitation_list_title", "invitation_list_empty", "invitation_field_email", "invitation_field_role", "invitation_revoke_action"]) {
      expect(src.includes(`"${key}"`), key).toBe(true);
      expect(tr(key, "ar")).not.toBe(key);
    }
  });
  test("only managers see it — the routes refuse others anyway", () => {
    expect(/membershipRole/.test(src)).toBe(true);
  });
});

describe("it is mounted where a bidder manages their account", () => {
  test("Settings renders the panel", () => {
    expect(/<TeamInvitationsPanel/.test(read("src/components/dashboard/views.tsx"))).toBe(true);
  });
});
