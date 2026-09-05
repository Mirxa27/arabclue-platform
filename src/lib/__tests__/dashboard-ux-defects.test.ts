/**
 * Observed on production 2026-09-05 (Playwright, 1440 and 375 px):
 *
 * - Admin › New User failed by default: the form sent `mfaEnabled: true`,
 *   which POST /api/admin/users answers with 400 MFA_NOT_SET_UP, and the
 *   password field said "Leave blank for default" while the schema requires
 *   ten characters. Every failure surfaced as a bare "Create failed".
 * - Running the agents re-categorised the project: both run call sites sent
 *   the store-held `tenderType` (the wizard's last pick, "IT" by default) and
 *   the route wrote it over `project.category`.
 * - With Autopilot on, an upload whose run was refused with 403
 *   ONBOARDING_INCOMPLETE showed nothing; the mission tray never sent its
 *   Autopilot switch at all and the route hard-coded `autoRoute: true`.
 * - Pricing: all three CTAs (Enterprise included) went to /login, the yearly
 *   toggle was lost on the way, and in RTL the toggle's white pill animated a
 *   bare `left`, landing under the inactive label. "All plans include: Audit
 *   log" named a platform-admin-only screen.
 * - Registration copy promised a "Free STARTER plan"; the seeded subscription
 *   is a 30-day trial.
 * - The Etimad cockpit read a store-held project that was not rehydrated on
 *   reload ("no Etimad reference", "deadline not set" while the card below
 *   showed both), and no UI could set a deadline.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminUserCreateSchema } from "../validation";
import { localizationRegistry } from "../i18n";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

describe("admin Create User succeeds with the defaults", () => {
  const src = read("src/components/admin/security.tsx");

  test("the create form no longer defaults mfaEnabled to true (the server refuses it)", () => {
    expect(src).not.toMatch(/mfaEnabled:\s*true/);
    // The switch is gone from the create dialog; MFA is user-enrolled.
    expect(src).not.toMatch(/onCheckedChange=\{\(v\) => setForm\(\{ \.\.\.form, mfaEnabled: v \}\)\}/);
  });

  test("the password is required client-side at the server's minimum", () => {
    expect(src).toMatch(/const ADMIN_PASSWORD_MIN_LENGTH = 10;/);
    expect(src).toMatch(/minLength=\{ADMIN_PASSWORD_MIN_LENGTH\}/);
    expect(src).not.toMatch(/Leave blank for default/);
    expect(src).toMatch(/passwordTooShort/);
    // Mirrors adminUserCreateSchema.password (min 10).
    const base = { email: "a@b.co", name: "A" };
    expect(adminUserCreateSchema.safeParse({ ...base, password: "123456789" }).success).toBe(false);
    expect(adminUserCreateSchema.safeParse({ ...base, password: "1234567890" }).success).toBe(true);
  });

  test("every failure carries the server's bilingual reason", () => {
    expect(src).not.toMatch(/throw new Error\("failed"\)/);
    expect(src).toMatch(/apiErrorText\(await res\.json\(\)\.catch\(\(\) => null\), locale\)/);
    // The post-create plan PATCH is checked instead of fire-and-forget.
    expect(src).toMatch(/if \(!planRes\.ok\)/);
  });
});

describe("running the agents does not rewrite the project category", () => {
  test("neither run call site sends the store-held tenderType", () => {
    for (const file of [
      "src/components/dashboard/agent-workflow.tsx",
      "src/components/dashboard/file-ingestion.tsx",
    ]) {
      const src = read(file);
      expect(src, file).not.toMatch(/JSON\.stringify\(\{[^}]*\btenderType\b/);
    }
  });
});

describe("autopilot blocked by account setup is told, with a way out", () => {
  test("the Documents drop zone toasts the missing steps and opens guided setup", () => {
    const src = read("src/components/dashboard/file-ingestion.tsx");
    expect(src).toMatch(/body\.code === "ONBOARDING_INCOMPLETE"/);
    expect(src).toMatch(/tr\("autopilot_blocked_onboarding_title", locale\)/);
    expect(src).toMatch(/setView\("setup"\)/);
    expect(localizationRegistry.autopilot_blocked_onboarding_title.en).toBe(
      "Upload saved. Autopilot is waiting for account setup"
    );
  });

  test("the mission tray sends its Autopilot switch and reads the structured block", () => {
    const tray = read("src/components/dashboard/mission-attachment-tray.tsx");
    expect(tray).toMatch(/form\.set\("autopilot", String\(autopilot\)\)/);
    expect(tray).toMatch(/activeProjectId, autopilot \}/);
    expect(tray).toMatch(/outcome\.reason !== "ONBOARDING_INCOMPLETE"/);
    // The two "Drive/OneDrive" items opened a paste dialog; say so.
    expect(tray).not.toMatch(/>Google Drive<\/DropdownMenuItem>/);
    expect(tray).toMatch(/Paste a Drive\/OneDrive export/);

    const route = read("src/app/api/platform-agent/missions/[id]/attachments/route.ts");
    expect(route).not.toMatch(/autoRoute: true/);
    expect(route).toMatch(/autoRoute: autopilot/);
    expect(route).toMatch(/autoRoute: body\.autopilot/);
    expect(route).toMatch(/reason: "ONBOARDING_INCOMPLETE" as const/);
    expect(route).toMatch(/started: false/);
  });
});

describe("pricing hands the chosen plan to sign-up", () => {
  const src = read("src/components/marketing/packages-section.tsx");

  test("no plan card sends a prospect to /login", () => {
    expect(src).not.toMatch(/href="\/login"/);
    expect(read("src/app/pricing/page.tsx")).not.toMatch(/\/login/);
    expect(read("src/app/pricing/page.tsx")).toMatch(/href="\/register"/);
  });

  test("Starter and Pro CTAs carry plan and billing cycle to /register", () => {
    expect(src).toMatch(/`\/register\?plan=\$\{plan\}&cycle=\$\{cycle\}`/);
    expect(src).toMatch(/registerHref\(plan\.code, cycle\)/);
    expect(src).toMatch(/const cycle: BillingCycleParam = yearly \? "yearly" : "monthly"/);
  });

  test("Enterprise talks to sales by mail and still offers the trial", () => {
    expect(src).toMatch(/talkToSalesHref\(locale\)/);
    expect(src).toMatch(/`mailto:\$\{SALES_EMAIL\}/);
    expect(src).toMatch(/contactChannels\[0\]\.email/);
    expect(src).toMatch(/Or start a 30-day free trial/);
  });

  test("the billing toggle's pill is positioned from the reading start, not a bare left", () => {
    // In RTL `left` put the pill under the inactive label: black-on-dark
    // active text, white-on-white inactive text.
    expect(src).not.toMatch(/animate=\{\{\s*left/);
    expect(src).toMatch(/insetInlineStart: yearly \? "calc\(50% \+ 2px\)" : "4px"/);
  });

  test("'All plans include' names nothing a customer cannot open", () => {
    expect(src).not.toMatch(/en: "Audit log"/);
    expect(src).not.toMatch(/سجل تدقيق/);
  });
});

describe("registration receives the intended plan and says what the trial is", () => {
  const src = read("src/app/register/page.tsx");

  test("plan/cycle from the URL are stored for Billing and the user lands there", () => {
    expect(src).toMatch(/const INTENDED_PLAN_STORAGE_KEY = "arabclue-intended-plan";/);
    expect(src).toMatch(/localStorage\.setItem\(\s*INTENDED_PLAN_STORAGE_KEY,\s*JSON\.stringify\(\{ \.\.\.intendedPlan, at: new Date\(\)\.toISOString\(\) \}\)/);
    expect(src).toMatch(/searchParams\.get\("plan"\)/);
    expect(src).toMatch(/searchParams\.get\("cycle"\)/);
    expect(src).toMatch(/intendedPlan \? "\/app\/billing" : "\/app"/);
    expect(src).toMatch(/tr\("auth_register_intended_plan", locale, \{ plan: intendedPlanName \}\)/);
  });

  test("the copy says 30-day free trial, not a free STARTER plan", () => {
    expect(src).not.toMatch(/STARTER plan|باقة STARTER/);
    expect(src).toMatch(/tr\("auth_register_trial_hint", locale\)/);
    expect(src).not.toMatch(/auth_register_verify_hint/);
    expect(localizationRegistry.auth_register_trial_hint.en).toMatch(/^30-day free trial/);
    expect(localizationRegistry.auth_register_trial_hint.ar).toMatch(/30 يوم/);
  });

  test("the auto sign-in after a verified registration is kept", () => {
    expect(src).toMatch(/signIn\("credentials", \{\s*redirect: false/);
  });
});

describe("dead and misleading controls now do something", () => {
  test("topbar: run notifications resolve their /app path; an empty search says so", () => {
    const src = read("src/components/dashboard/topbar.tsx");
    expect(src).toMatch(/resolveAppPath\(pathname\)/);
    expect(src).toMatch(/router\.push\(href\)/);
    expect(src).toMatch(/tr\("search_no_results", locale\)/);
    expect(src).not.toMatch(/if \(n\.href\?\.includes\("view="\)\) \{/);
  });

  test("'Upload documents' on the Documents page goes to the drop zone, not to the same view", () => {
    expect(read("src/components/dashboard/file-ingestion.tsx")).toMatch(/id=\{UPLOAD_DROPZONE_ID\}/);
    for (const file of [
      "src/components/dashboard/document-matrix.tsx",
      "src/components/dashboard/requirements-matrix.tsx",
      "src/components/dashboard/version-history.tsx",
    ]) {
      expect(read(file), file).toMatch(/focusUploadDropzone\(/);
    }
    // The per-row "Requirements matrix" button scrolls to the matrix below.
    expect(read("src/components/dashboard/document-matrix.tsx")).toMatch(/getElementById\(REQUIREMENTS_MATRIX_ID\)/);
  });

  test("mutations that failed silently now toast the server's reason", () => {
    const sidebar = read("src/components/dashboard/sidebar.tsx");
    expect(sidebar).toMatch(/Could not switch workspace/);
    const brand = read("src/components/dashboard/brand-setup.tsx");
    expect(brand).not.toMatch(/throw new Error\("save failed"\)|throw new Error\("add failed"\)/);
    expect((brand.match(/onError: \(err: Error\) =>/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const settings = read("src/components/dashboard/settings-panel.tsx");
    expect(settings).toMatch(/setLocale\(previous\)/);
    const agents = read("src/components/dashboard/agent-workflow.tsx");
    expect(agents).toMatch(/Could not stop the run/);
  });

  test("account setup panels no longer fire raw fetches without reading res.ok", () => {
    const src = read("src/components/dashboard/account-onboarding.tsx");
    expect(src).not.toMatch(/onClick=\{async \(\) => \{\s*await fetch\(/);
    expect(src).toMatch(/const markReviewed = useMutation/);
    expect(src).toMatch(/const addSector = useMutation/);
    expect(src).toMatch(/const addBid = useMutation/);
    expect(src).toMatch(/const addRestriction = useMutation/);
  });

  test("the guided wizard checks its restrictions PATCH, validates the tracked tender, and resumes", () => {
    const src = read("src/components/dashboard/onboarding-wizard.tsx");
    expect(src).toMatch(/if \(!rr\.ok\)/);
    expect(src).toMatch(/setConnectError\(/);
    expect(src).toMatch(/untick tracking/);
    // Seeded from persisted data instead of opening at step 1 / 0 % on reload.
    expect(src).toMatch(/const seeded = useRef\(false\)/);
    expect(src).toMatch(/firstIncomplete/);
  });

  test("the audit log filters on the server and can load more", () => {
    const src = read("src/components/admin/audit.tsx");
    expect(src).not.toMatch(/\/api\/admin\/audit\?limit=200/);
    expect(src).toMatch(/params\.set\("action", actionFilter\)/);
    expect(src).toMatch(/params\.set\("severity", severityFilter\)/);
    expect(src).toMatch(/Load more/);
    expect(src).not.toMatch(/throw new Error\("failed"\)/);
  });
});

describe("the Etimad cockpit tells the truth", () => {
  test("reads the active project from the projects list and can set the deadline", () => {
    const src = read("src/components/dashboard/etimad-workflow-cockpit.tsx");
    expect(src).toMatch(/queryKey: \["projects"\]/);
    expect(src).toMatch(/type="datetime-local"/);
    expect(src).toMatch(/method: "PATCH"/);
    expect(src).toMatch(/submissionDeadline/);
    expect(src).not.toMatch(/update in tender setup/);
    // The checklist is still local; say so instead of implying the team sees it.
    expect(src).toMatch(/tr\("etimad_checklist_device_only", locale\)/);
    expect(src).not.toMatch(/export function useProjectEtimadMeta/);
    expect(read("src/components/dashboard/tender-flow-board.tsx")).not.toMatch(/useProjectEtimadMeta/);
  });

  test("the tender wizard waits for the list before moving to Documents", () => {
    const src = read("src/components/dashboard/tender-setup-wizard.tsx");
    expect(src).toMatch(/await qc\.invalidateQueries\(\{ queryKey: \["projects"\] \}\);/);
    expect(src).toMatch(/setView\("documents"\)/);
  });
});

describe("a project with no compliance checks shows no percentage", () => {
  test("projects list renders a dash from an empty sample", () => {
    const src = read("src/components/dashboard/projects-list.tsx");
    expect(src).toMatch(/hasComplianceSample \? `\$\{compliancePct\}%` : "—"/);
  });
});
