import { z } from "zod";
import { validationFailure } from "@/lib/api-failure";
import { jsonApiFailure, jsonFailure } from "@/lib/api-controller";
import { NextRequest, NextResponse } from "next/server";
import { computeOnboardingSteps } from "@/lib/onboarding";
import { requireSession, canWriteRole } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { getOrCreateMission } from "@/lib/agents/platform/mission";
import { stageMissionAttachment } from "@/lib/agents/platform/stage-attachment";
import { fetchUrlAsAttachment } from "@/lib/agents/platform/connectors";
import { normalizeAttachmentSource } from "@/lib/agents/platform/classify-attachment";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { QuotaExceededError, quotaFailureCode } from "@/lib/quotas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * The tray's Autopilot switch. Absent means on, which is what every caller
 * before the switch was wired got — so an old client keeps its behaviour.
 */
const autopilotFlagSchema = z.boolean().default(true);

const jsonBodySchema = z.object({
  url: z.string().optional(),
  text: z.string().optional(),
  fileName: z.string().optional(),
  source: z.string().optional(),
  activeProjectId: z.string().nullable().optional(),
  mimeType: z.string().optional(),
  autopilot: autopilotFlagSchema,
});

/** Multipart carries strings: only an explicit "false" turns autopilot off. */
function autopilotFromForm(value: FormDataEntryValue | null): boolean {
  return autopilotFlagSchema.parse(value === "false" ? false : true);
}

type StagedResult = Awaited<ReturnType<typeof stageMissionAttachment>>;

function isOnboardingBlock(autopilot: Record<string, unknown>): boolean {
  if (autopilot.code === "ONBOARDING_INCOMPLETE") return true;
  if (autopilot.reason === "ONBOARDING_INCOMPLETE") return true;
  // Today `maybeAutopilotAfterIngest` answers the onboarding gate with a
  // clarify whose question is `assertOnboardingReady`'s sentence.
  return (
    typeof autopilot.question === "string" &&
    autopilot.question.startsWith("Complete account onboarding")
  );
}

/**
 * Adds `started` (and `reason` + `missing` when the run is waiting on account
 * setup) to the autopilot outcome without dropping the fields the console
 * already reads (`mode`, `projectId`, `runId`, `message`, `question`).
 * The upload itself succeeded, so this stays a 200.
 */
async function describeAutopilot(
  result: StagedResult,
  requested: boolean,
  workspaceId: string
) {
  const raw = result.autopilot as Record<string, unknown> | null;
  if (!requested || !raw) return { ...result, autopilot: raw };
  if (raw.mode === "autopilot") return { ...result, autopilot: { ...raw, started: true } };
  if (!isOnboardingBlock(raw)) return { ...result, autopilot: { ...raw, started: false } };
  // A `mode: "blocked"` result already names the steps; older clarify-shaped
  // results do not, so ask the onboarding computation once.
  const missing = Array.isArray(raw.missing)
    ? raw.missing
    : ((await computeOnboardingSteps(workspaceId).catch(() => null))?.missing ?? []);
  return {
    ...result,
    autopilot: {
      ...raw,
      started: false,
      reason: "ONBOARDING_INCOMPLETE" as const,
      missing,
    },
  };
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireSession();
  if (!session) {
    return jsonApiFailure("AUTHENTICATION_REQUIRED");
  }
  const { id: missionId } = await ctx.params;
  const tenant = await getTenantContext(session.user.id);
  // Every accepted attachment runs `classifyAttachmentWithAi` before it lands,
  // so a loop over a folder is a loop over the provider.
  const limited = await checkAiRateLimit({
    route: "platform-agent.attachments",
    identifier: tenant.workspace.id,
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const locale = session.user.locale === "en" ? "en" : "ar";
  const canWrite = canWriteRole(session.user.role);

  const mission = await getOrCreateMission({
    workspaceId: tenant.workspace.id,
    userId: session.user.id,
    locale,
  });
  if (mission.id !== missionId) {
    return jsonApiFailure("MISSION_NOT_FOUND");
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return jsonFailure(validationFailure(["file"]));
      }
      const source = normalizeAttachmentSource(
        String(form.get("source") || "upload"),
        "upload"
      );
      const activeProjectId = form.get("activeProjectId")
        ? String(form.get("activeProjectId"))
        : mission.activeProjectId;
      const autopilot = autopilotFromForm(form.get("autopilot"));
      const bytes = Buffer.from(await file.arrayBuffer());
      const result = await stageMissionAttachment({
        missionId: mission.id,
        workspaceId: tenant.workspace.id,
        userId: session.user.id,
        locale,
        canWrite,
        activeProjectId,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes,
        source,
        autoRoute: autopilot,
      });
      return NextResponse.json(
        await describeAutopilot(result, autopilot, tenant.workspace.id)
      );
    }

    const parsedBody = jsonBodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsedBody.success) {
      return jsonFailure(validationFailure(["file", "url", "text"]));
    }
    const body = parsedBody.data;

    if (body.url) {
      const fetched = await fetchUrlAsAttachment(body.url);
      const result = await stageMissionAttachment({
        missionId: mission.id,
        workspaceId: tenant.workspace.id,
        userId: session.user.id,
        locale,
        canWrite,
        activeProjectId: body.activeProjectId ?? mission.activeProjectId,
        originalName: fetched.originalName,
        mimeType: fetched.mimeType,
        bytes: fetched.bytes,
        source: "url",
        textPreview: fetched.textPreview,
        autoRoute: body.autopilot,
      });
      return NextResponse.json(
        await describeAutopilot(result, body.autopilot, tenant.workspace.id)
      );
    }

    if (body.text && body.text.trim()) {
      const bytes = Buffer.from(body.text, "utf8");
      const result = await stageMissionAttachment({
        missionId: mission.id,
        workspaceId: tenant.workspace.id,
        userId: session.user.id,
        locale,
        canWrite,
        activeProjectId: body.activeProjectId ?? mission.activeProjectId,
        originalName: body.fileName || "pasted-content.txt",
        mimeType: body.mimeType || "text/plain",
        bytes,
        source: normalizeAttachmentSource(body.source, "paste"),
        textPreview: body.text.slice(0, 4000),
        autoRoute: body.autopilot,
      });
      return NextResponse.json(
        await describeAutopilot(result, body.autopilot, tenant.workspace.id)
      );
    }

    return jsonFailure(validationFailure(["file", "url", "text"]));
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return jsonApiFailure(quotaFailureCode(err));
    }
    console.error("[mission attachments]", err);
    return jsonApiFailure("INTERNAL_ERROR");
  }
}
