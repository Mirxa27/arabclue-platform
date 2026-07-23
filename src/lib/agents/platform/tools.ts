import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { AGENTS } from "@/lib/constants";
import { tr } from "@/lib/i18n";
import { seedComplianceChecks } from "@/lib/bootstrap";
import { runAgentPipeline } from "@/lib/agents/orchestrator";
import { assertWorkspaceMatch } from "@/lib/workspace-context";
import { assertWithinQuota, QuotaExceededError } from "@/lib/quotas";
import { assertOnboardingReady } from "@/lib/onboarding";
import { ApiError } from "@/lib/api-controller";
import type { AgentState } from "@/lib/types";
import {
  DASHBOARD_VIEWS,
  type PlatformAgentContext,
} from "./context";

/** Bridge Zod 4 schemas into AI SDK tool() overload resolution. */
function platformTool<SCHEMA extends z.ZodType, OUTPUT>(opts: {
  description: string;
  inputSchema: SCHEMA;
  execute: (input: z.infer<SCHEMA>) => Promise<OUTPUT> | OUTPUT;
}) {
  return tool({
    description: opts.description,
    inputSchema: opts.inputSchema,
    execute: opts.execute,
  } as unknown as Parameters<typeof tool>[0]);
}

function denyWrite(ctx: PlatformAgentContext) {
  return {
    ok: false as const,
    error: "Read-only role: writers/admins may mutate data.",
  };
}

function denyAdmin(ctx: PlatformAgentContext) {
  return {
    ok: false as const,
    error: "Admin privileges required for this action.",
  };
}

async function requireProject(
  ctx: PlatformAgentContext,
  projectId: string
) {
  const project = await db.tenderProject.findFirst({
    where: { id: projectId, workspaceId: ctx.workspace.id },
  });
  if (!project) return null;
  return project;
}

export function createPlatformTools(ctx: PlatformAgentContext) {
  return {
    explainPlatform: platformTool({
      description:
        "Explain ArabClue features, workflows, and how to use the platform.",
      inputSchema: z.object({
        topic: z
          .string()
          .describe(
            "Feature or workflow: projects, documents, agents, proposals, contracts, compliance, billing, reviews, admin, constitution"
          ),
      }),
      execute: async ({ topic }) => {
        const t = topic.toLowerCase();
        const map: Record<string, string> = {
          projects:
            "Create tender projects with Etimad refs, category, deadlines, Saudization/local-content targets. Open Projects view.",
          documents:
            "Upload tender documents on Documents; versions and compare live under History.",
          agents:
            "Agents runs 6 specialists: Ingestion, Compliance, Technical, Financial, Proposal Drafting, Law & Contract. Start from Agents with an active project.",
          proposals:
            "Generated proposals appear in Proposals after drafting. Validate, rewrite sections, export, and submit for review.",
          contracts:
            "Law agent drafts bilingual EN|AR contracts (type CONTRACT). Review in Contracts; counsel must verify — never 100% legal certainty.",
          compliance:
            "Compliance tracks framework controls per project after seeding/runs.",
          billing:
            "Billing shows plans and MyFatoorah subscription status. ArabClue does not suggest bid pricing.",
          reviews:
            "Reviews queue holds pending proposal approvals for assigned reviewers.",
          admin:
            "Admins configure AI providers (live model fetch), env secrets, plans, MyFatoorah, users/RBAC, and audit.",
          constitution:
            "Human final author; evidence-only; no pricing strategy; regulatory precision; compliance ≠ legal advice; no 100% legal certainty.",
        };
        const hit = Object.entries(map).find(([k]) => t.includes(k));
        return {
          topic,
          guide:
            hit?.[1] ??
            "ArabClue prepares Saudi tenders: projects → documents → agent pipeline → proposals/contracts → reviews. Ask about a specific area.",
        };
      },
    }),

    navigateToView: platformTool({
      description:
        "Navigate the dashboard UI so the user watches the relevant screen while you work.",
      inputSchema: z.object({
        view: z.enum(DASHBOARD_VIEWS),
        projectId: z
          .string()
          .optional()
          .describe("Optional project to focus in the UI"),
        reason: z.string().optional(),
      }),
      execute: async ({ view, projectId, reason }) => {
        if (view.startsWith("admin_") && !ctx.isAdmin) {
          return denyAdmin(ctx);
        }
        if (projectId) {
          const p = await requireProject(ctx, projectId);
          if (!p) return { ok: false as const, error: "Project not found" };
        }
        return {
          ok: true as const,
          view,
          projectId: projectId ?? null,
          reason: reason ?? null,
          uiAction: "navigate" as const,
        };
      },
    }),

    setActiveProject: platformTool({
      description: "Focus a tender project in the UI for subsequent actions.",
      inputSchema: z.object({ projectId: z.string() }),
      execute: async ({ projectId }) => {
        const p = await requireProject(ctx, projectId);
        if (!p) return { ok: false as const, error: "Project not found" };
        return {
          ok: true as const,
          projectId: p.id,
          title: p.title,
          titleAr: p.titleAr,
          uiAction: "setActiveProject" as const,
        };
      },
    }),

    getWorkspaceOverview: platformTool({
      description: "Dashboard KPIs and workspace summary.",
      inputSchema: z.object({}),
      execute: async () => {
        const wid = ctx.workspace.id;
        const [projects, documents, proposals, agentRuns, compliance] =
          await Promise.all([
            db.tenderProject.count({ where: { workspaceId: wid } }),
            db.uploadedDocument.count({ where: { workspaceId: wid } }),
            db.generatedProposal.count({ where: { workspaceId: wid } }),
            db.agentRun.findMany({
              where: { project: { workspaceId: wid } },
              select: { status: true },
              take: 200,
            }),
            db.complianceCheck.findMany({
              where: { project: { workspaceId: wid } },
              select: { status: true },
              take: 500,
            }),
          ]);
        const compliant = compliance.filter((c) => c.status === "COMPLIANT").length;
        return {
          workspace: {
            id: ctx.workspace.id,
            name: ctx.workspace.name,
            nameAr: ctx.workspace.nameAr,
            plan: ctx.workspace.plan,
          },
          counts: {
            projects,
            documents,
            proposals,
            runningAgents: agentRuns.filter((a) => a.status === "RUNNING").length,
            completedAgents: agentRuns.filter((a) => a.status === "COMPLETED")
              .length,
          },
          avgCompliance:
            compliance.length > 0
              ? Math.round((compliant / compliance.length) * 100)
              : null,
        };
      },
    }),

    listProjects: platformTool({
      description: "List tender projects in the workspace.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ limit }) => {
        const projects = await db.tenderProject.findMany({
          where: { workspaceId: ctx.workspace.id },
          orderBy: { createdAt: "desc" },
          take: limit ?? 20,
          select: {
            id: true,
            title: true,
            titleAr: true,
            etimadRef: true,
            category: true,
            status: true,
            submissionDeadline: true,
            budget: true,
            currency: true,
            createdAt: true,
          },
        });
        return { projects };
      },
    }),

    getProject: platformTool({
      description: "Get details for one tender project.",
      inputSchema: z.object({ projectId: z.string() }),
      execute: async ({ projectId }) => {
        const project = await db.tenderProject.findFirst({
          where: { id: projectId, workspaceId: ctx.workspace.id },
          include: {
            _count: {
              select: {
                documents: true,
                proposals: true,
                agentRuns: true,
                complianceChecks: true,
              },
            },
            agentRuns: {
              orderBy: { createdAt: "desc" },
              take: 3,
              select: {
                id: true,
                status: true,
                overallProgress: true,
                createdAt: true,
                errorMessage: true,
              },
            },
          },
        });
        if (!project) return { ok: false as const, error: "not found" };
        return { ok: true as const, project };
      },
    }),

    createProject: platformTool({
      description: "Create a new tender project.",
      inputSchema: z.object({
        title: z.string().min(2),
        titleAr: z.string().optional(),
        etimadRef: z.string().optional(),
        category: z.string().optional(),
        budget: z.number().optional(),
        currency: z.string().optional(),
        submissionDeadline: z
          .string()
          .optional()
          .describe("ISO date string"),
        saudizationTarget: z.number().optional(),
        localContentTarget: z.number().optional(),
      }),
      execute: async (input) => {
        if (!ctx.canWrite) return denyWrite(ctx);
        const project = await db.tenderProject.create({
          data: {
            workspaceId: ctx.workspace.id,
            createdById: ctx.userId,
            etimadRef:
              input.etimadRef ||
              `ETM-${Date.now().toString(36).toUpperCase()}`,
            title: input.title,
            titleAr: input.titleAr ?? null,
            category: input.category || "IT",
            budget: input.budget ?? null,
            currency: input.currency || "SAR",
            submissionDeadline: input.submissionDeadline
              ? new Date(input.submissionDeadline)
              : null,
            saudizationTarget: input.saudizationTarget ?? 35,
            localContentTarget: input.localContentTarget ?? 40,
            status: "DRAFT",
          },
        });
        await audit({
          userId: ctx.userId,
          action: AUDIT_ACTIONS.PROJECT_CREATE,
          resource: "TenderProject",
          resourceId: project.id,
          details: { title: project.title },
        });
        return {
          ok: true as const,
          project,
          uiAction: "setActiveProject" as const,
          projectId: project.id,
        };
      },
    }),

    updateProject: platformTool({
      description: "Update fields on an existing tender project.",
      inputSchema: z.object({
        projectId: z.string(),
        title: z.string().optional(),
        titleAr: z.string().optional(),
        category: z.string().optional(),
        status: z.string().optional(),
        budget: z.number().nullable().optional(),
        submissionDeadline: z.string().nullable().optional(),
        saudizationTarget: z.number().optional(),
        localContentTarget: z.number().optional(),
      }),
      execute: async (input) => {
        if (!ctx.canWrite) return denyWrite(ctx);
        const existing = await requireProject(ctx, input.projectId);
        if (!existing) return { ok: false as const, error: "not found" };
        const project = await db.tenderProject.update({
          where: { id: existing.id },
          data: {
            ...(input.title != null ? { title: input.title } : {}),
            ...(input.titleAr !== undefined ? { titleAr: input.titleAr } : {}),
            ...(input.category != null ? { category: input.category } : {}),
            ...(input.status != null ? { status: input.status } : {}),
            ...(input.budget !== undefined ? { budget: input.budget } : {}),
            ...(input.submissionDeadline !== undefined
              ? {
                  submissionDeadline: input.submissionDeadline
                    ? new Date(input.submissionDeadline)
                    : null,
                }
              : {}),
            ...(input.saudizationTarget != null
              ? { saudizationTarget: input.saudizationTarget }
              : {}),
            ...(input.localContentTarget != null
              ? { localContentTarget: input.localContentTarget }
              : {}),
          },
        });
        return { ok: true as const, project };
      },
    }),

    listDocuments: platformTool({
      description: "List uploaded documents, optionally for a project.",
      inputSchema: z.object({
        projectId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ projectId, limit }) => {
        if (projectId) {
          const p = await requireProject(ctx, projectId);
          if (!p) return { ok: false as const, error: "project not found" };
        }
        const documents = await db.uploadedDocument.findMany({
          where: {
            workspaceId: ctx.workspace.id,
            ...(projectId ? { projectId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit ?? 20,
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            projectId: true,
            createdAt: true,
            parseStatus: true,
            docCategory: true,
          },
        });
        return { ok: true as const, documents };
      },
    }),

    getDocumentSummary: platformTool({
      description: "Summarize a document metadata and text excerpt.",
      inputSchema: z.object({ documentId: z.string() }),
      execute: async ({ documentId }) => {
        const doc = await db.uploadedDocument.findFirst({
          where: { id: documentId, workspaceId: ctx.workspace.id },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            projectId: true,
            parseStatus: true,
            parsedSummary: true,
            docCategory: true,
            createdAt: true,
          },
        });
        if (!doc) return { ok: false as const, error: "not found" };
        const text = doc.parsedSummary?.slice(0, 1200) ?? "";
        return {
          ok: true as const,
          document: {
            id: doc.id,
            originalName: doc.originalName,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            projectId: doc.projectId,
            parseStatus: doc.parseStatus,
            docCategory: doc.docCategory,
            createdAt: doc.createdAt,
            excerpt: text,
            excerptLength: text.length,
          },
        };
      },
    }),

    listProposals: platformTool({
      description:
        "List proposals and/or contracts for the workspace. Use type CONTRACT for law drafts.",
      inputSchema: z.object({
        projectId: z.string().optional(),
        type: z
          .enum([
            "CONTRACT",
            "TECHNICAL",
            "FINANCIAL",
            "EA_MATRIX",
            "BOQ",
            "COMBINED",
            "ALL",
          ])
          .optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ projectId, type, limit }) => {
        const proposals = await db.generatedProposal.findMany({
          where: {
            workspaceId: ctx.workspace.id,
            ...(projectId ? { projectId } : {}),
            ...(type && type !== "ALL" ? { type } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: limit ?? 20,
          select: {
            id: true,
            type: true,
            title: true,
            titleAr: true,
            status: true,
            version: true,
            projectId: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        return { proposals };
      },
    }),

    getProposal: platformTool({
      description:
        "Get a proposal or contract overview with excerpt; contracts include regulatory research artifacts when present.",
      inputSchema: z.object({ proposalId: z.string() }),
      execute: async ({ proposalId }) => {
        const proposal = await db.generatedProposal.findFirst({
          where: { id: proposalId, workspaceId: ctx.workspace.id },
          include: {
            project: {
              select: { id: true, title: true, titleAr: true, etimadRef: true },
            },
          },
        });
        if (!proposal) return { ok: false as const, error: "not found" };
        const content = proposal.contentMd ?? "";
        const { parseProposalArtifacts } = await import(
          "./regulatory-synthesis"
        );
        const artifacts = parseProposalArtifacts(proposal.artifactsJson);
        const research = artifacts.research as
          | {
              findings?: Array<{ topicEn?: string; certainty?: string }>;
              disclaimerEn?: string;
            }
          | undefined;
        return {
          ok: true as const,
          title: proposal.title,
          content: content.slice(0, 1500),
          proposal: {
            id: proposal.id,
            type: proposal.type,
            title: proposal.title,
            titleAr: proposal.titleAr,
            status: proposal.status,
            version: proposal.version,
            project: proposal.project,
            createdAt: proposal.createdAt,
            excerpt: content.slice(0, 1500),
            contentLength: content.length,
            articleCount: artifacts.articles?.length ?? 0,
            research: research
              ? {
                  findingsCount: research.findings?.length ?? 0,
                  findings: (research.findings ?? []).slice(0, 12),
                  disclaimerEn: research.disclaimerEn,
                }
              : null,
          },
        };
      },
    }),

    getCompliance: platformTool({
      description:
        "Compliance matrix summary, framework breakdown, and gap controls with evidence for a project.",
      inputSchema: z.object({
        projectId: z.string().optional(),
      }),
      execute: async ({ projectId }) => {
        const pid = projectId || ctx.activeProjectId || undefined;
        if (pid) {
          const p = await requireProject(ctx, pid);
          if (!p) return { ok: false as const, error: "project not found" };
        }
        const where = pid
          ? { projectId: pid }
          : { project: { workspaceId: ctx.workspace.id } };
        const checks = await db.complianceCheck.findMany({
          where,
          orderBy: [{ framework: "asc" }, { controlId: "asc" }],
          take: 200,
        });
        const summary = {
          total: checks.length,
          compliant: checks.filter((c) => c.status === "COMPLIANT").length,
          partial: checks.filter((c) => c.status === "PARTIAL").length,
          nonCompliant: checks.filter(
            (c) => c.status === "NON_COMPLIANT" || c.status === "GAP"
          ).length,
          pending: checks.filter((c) => c.status === "PENDING").length,
        };
        const frameworks = Array.from(
          new Set(checks.map((c) => c.framework))
        ).map((fw) => {
          const rows = checks.filter((c) => c.framework === fw);
          return {
            framework: fw,
            total: rows.length,
            gaps: rows.filter(
              (c) =>
                c.status === "NON_COMPLIANT" ||
                c.status === "GAP" ||
                c.status === "PARTIAL"
            ).length,
          };
        });
        const gaps = checks
          .filter(
            (c) =>
              c.status === "NON_COMPLIANT" ||
              c.status === "GAP" ||
              c.status === "PARTIAL"
          )
          .slice(0, 20)
          .map((c) => ({
            id: c.id,
            framework: c.framework,
            controlId: c.controlId,
            title: c.title,
            titleAr: c.titleAr,
            status: c.status,
            evidence: c.evidence,
            remediation: c.remediation,
            complianceLevel: c.complianceLevel,
          }));
        return {
          ok: true as const,
          projectId: pid ?? null,
          summary,
          frameworks,
          gaps,
          disclaimer:
            "Compliance assistance is not legal advice. Counsel review is required.",
        };
      },
    }),

    researchSaudiLaw: platformTool({
      description:
        "Synthesize a real-time Saudi regulatory research brief (GTPL/PDPL/NCA/NORA registry + tender anchors) for a project. Draft-grade only — never 100% legal certainty.",
      inputSchema: z.object({
        projectId: z.string().optional(),
      }),
      execute: async ({ projectId }) => {
        const pid = projectId || ctx.activeProjectId;
        if (!pid) {
          return {
            ok: false as const,
            error: "projectId or active project required",
          };
        }
        const project = await requireProject(ctx, pid);
        if (!project) return { ok: false as const, error: "project not found" };

        const { synthesizeSaudiLawForProject } = await import(
          "./regulatory-synthesis"
        );
        const { recordMissionAction, completeMissionAction } = await import(
          "./mission"
        );

        let actionId: string | null = null;
        if (ctx.missionId) {
          const action = await recordMissionAction({
            missionId: ctx.missionId,
            workspaceId: ctx.workspace.id,
            userId: ctx.userId,
            toolName: "researchSaudiLaw",
            status: "RUNNING",
            input: { projectId: pid },
          });
          actionId = action.id;
        }

        const result = await synthesizeSaudiLawForProject({
          workspaceId: ctx.workspace.id,
          projectId: pid,
          projectTitle: project.title,
        });

        if (!result.ok) {
          if (actionId) {
            await completeMissionAction(actionId, {
              status: "FAILED",
              errorText: result.error,
            });
          }
          return result;
        }

        if (actionId) {
          await completeMissionAction(actionId, {
            status: "SUCCEEDED",
            output: {
              projectId: result.projectId,
              findings: result.research.findings.length,
              sources: result.research.sources.length,
            },
          });
        }

        return {
          ok: true as const,
          projectId: result.projectId,
          title: `Regulatory synthesis · ${project.title}`,
          checksUsed: result.checksUsed,
          research: result.research,
          findings: result.research.findings,
          sources: result.research.sources.slice(0, 12),
          disclaimerEn: result.research.disclaimerEn,
          disclaimerAr: result.research.disclaimerAr,
          certaintyNote:
            "REGISTRY_BACKED / TENDER_EXPLICIT / REQUIRES_COUNSEL — never 100% legal certainty.",
          uiAction: "navigate" as const,
          view: "compliance" as const,
        };
      },
    }),

    listRegulatoryRegistry: platformTool({
      description:
        "List ArabClue regulatory policy registry instruments (PDPL, NCA, GTPL, NORA posture) used for synthesis.",
      inputSchema: z.object({}),
      execute: async () => {
        const { listRegistrySnapshot } = await import("./regulatory-synthesis");
        return { ok: true as const, ...listRegistrySnapshot() };
      },
    }),

    startAgentPipeline: platformTool({
      description:
        "Start the full 6-agent bid pipeline for a project (async). Navigates user to Agents view.",
      inputSchema: z.object({
        projectId: z.string(),
        tenderType: z.string().optional(),
        budget: z.number().optional(),
      }),
      execute: async ({ projectId, tenderType, budget }) => {
        if (!ctx.canWrite) return denyWrite(ctx);
        try {
          await assertOnboardingReady(ctx.workspace.id);
        } catch (e) {
          if (e instanceof ApiError) {
            return { ok: false as const, error: e.message, code: e.code };
          }
          throw e;
        }
        try {
          await assertWithinQuota(ctx.userId, "proposal");
        } catch (e) {
          if (e instanceof QuotaExceededError) {
            return { ok: false as const, error: e.message, code: e.code };
          }
          throw e;
        }

        let project = await requireProject(ctx, projectId);
        if (!project) return { ok: false as const, error: "project not found" };

        const active = await db.agentRun.findFirst({
          where: {
            projectId: project.id,
            status: { in: ["QUEUED", "RUNNING"] },
          },
          orderBy: { createdAt: "desc" },
        });
        if (active) {
          return {
            ok: false as const,
            error: "An agent run is already in progress",
            runId: active.id,
            status: active.status,
            uiAction: "navigate" as const,
            view: "agents" as const,
            projectId: project.id,
          };
        }

        if (tenderType && tenderType !== project.category) {
          project = await db.tenderProject.update({
            where: { id: project.id },
            data: {
              category: tenderType,
              ...(budget != null ? { budget } : {}),
            },
          });
        }

        await seedComplianceChecks(project.id);
        await db.tenderProject.update({
          where: { id: project.id },
          data: { status: "PARSING" },
        });

        const locale = ctx.locale;
        const agentStates: AgentState[] = AGENTS.map((a) => ({
          id: a.id,
          name: tr(`agent_${a.id}_name` as Parameters<typeof tr>[0], "en"),
          nameAr: tr(`agent_${a.id}_name` as Parameters<typeof tr>[0], "ar"),
          status: "pending",
          progress: 0,
        }));

        const run = await db.$transaction(async (tx) => {
          const racing = await tx.agentRun.findFirst({
            where: {
              projectId: project.id,
              status: { in: ["QUEUED", "RUNNING"] },
            },
          });
          if (racing) return { conflict: true as const, run: racing };
          const created = await tx.agentRun.create({
            data: {
              projectId: project.id,
              triggeredById: ctx.userId,
              status: "QUEUED",
              overallProgress: 0,
              agentStates: JSON.stringify(agentStates),
              configJson: JSON.stringify({
                locale,
                workspaceId: ctx.workspace.id,
                userId: ctx.userId,
                projectId: project.id,
                regenerateMode: null,
                targetProposalId: null,
              }),
            },
          });
          return { conflict: false as const, run: created };
        });

        if (run.conflict) {
          return {
            ok: false as const,
            error: "An agent run is already in progress",
            runId: run.run.id,
            status: run.run.status,
          };
        }

        await audit({
          userId: ctx.userId,
          action: AUDIT_ACTIONS.AGENT_RUN,
          resource: "AgentRun",
          resourceId: run.run.id,
          details: { projectId: project.id, source: "platform-agent" },
        });

        void runAgentPipeline({
          runId: run.run.id,
          projectId: project.id,
          workspaceId: ctx.workspace.id,
          userId: ctx.userId,
          locale,
          targetProposalId: null,
        }).catch((err) =>
          console.error("[platform-agent pipeline]", err)
        );

        return {
          ok: true as const,
          runId: run.run.id,
          projectId: project.id,
          status: "QUEUED",
          agentStates,
          uiAction: "navigate" as const,
          view: "agents" as const,
        };
      },
    }),

    getAgentRunStatus: platformTool({
      description: "Poll agent pipeline status for a run or latest project run.",
      inputSchema: z.object({
        runId: z.string().optional(),
        projectId: z.string().optional(),
      }),
      execute: async ({ runId, projectId }) => {
        let run = runId
          ? await db.agentRun.findUnique({
              where: { id: runId },
              include: {
                project: { select: { workspaceId: true, title: true } },
              },
            })
          : projectId
            ? await db.agentRun.findFirst({
                where: {
                  projectId,
                  project: { workspaceId: ctx.workspace.id },
                },
                orderBy: { createdAt: "desc" },
                include: {
                  project: { select: { workspaceId: true, title: true } },
                },
              })
            : null;
        if (
          !run ||
          !assertWorkspaceMatch(run.project.workspaceId, ctx.workspace.id)
        ) {
          return { ok: false as const, error: "not found" };
        }
        let agentStates: unknown = [];
        try {
          agentStates = JSON.parse(run.agentStates || "[]");
        } catch {
          agentStates = [];
        }
        return {
          ok: true as const,
          runId: run.id,
          status: run.status,
          overallProgress: run.overallProgress,
          agentStates,
          title: run.project.title,
          run: {
            id: run.id,
            status: run.status,
            overallProgress: run.overallProgress,
            errorMessage: run.errorMessage,
            projectTitle: run.project.title,
            agentStates,
            startedAt: run.startedAt,
            completedAt: run.completedAt,
          },
        };
      },
    }),

    cancelAgentRun: platformTool({
      description: "Cancel a queued or running agent pipeline.",
      inputSchema: z.object({ runId: z.string() }),
      execute: async ({ runId }) => {
        if (!ctx.canWrite) return denyWrite(ctx);
        const run = await db.agentRun.findUnique({
          where: { id: runId },
          include: { project: { select: { workspaceId: true } } },
        });
        if (
          !run ||
          !assertWorkspaceMatch(run.project.workspaceId, ctx.workspace.id)
        ) {
          return { ok: false as const, error: "not found" };
        }
        if (
          run.status === "COMPLETED" ||
          run.status === "FAILED" ||
          run.status === "CANCELLED"
        ) {
          return { ok: true as const, status: run.status, runId: run.id };
        }
        await db.agentRun.updateMany({
          where: { id: runId, status: { in: ["QUEUED", "RUNNING"] } },
          data: {
            status: "CANCELLED",
            errorMessage: "Cancelled by platform agent",
            completedAt: new Date(),
          },
        });
        return { ok: true as const, status: "CANCELLED", runId };
      },
    }),

    listReviews: platformTool({
      description: "List proposal reviews in the workspace.",
      inputSchema: z.object({
        status: z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]).optional(),
      }),
      execute: async ({ status }) => {
        const reviews = await db.proposalReview.findMany({
          where: {
            proposal: { workspaceId: ctx.workspace.id },
            ...(status && status !== "ALL" ? { status } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 30,
          include: {
            proposal: {
              select: { id: true, title: true, status: true, type: true },
            },
          },
        });
        return {
          reviews: reviews.map((r) => ({
            id: r.id,
            status: r.status,
            stepIndex: r.stepIndex,
            reviewerId: r.reviewerId,
            proposal: r.proposal,
            comment: r.comment,
            createdAt: r.createdAt,
          })),
        };
      },
    }),

    decideReview: platformTool({
      description:
        "Approve or reject a pending review assigned to the current user.",
      inputSchema: z.object({
        reviewId: z.string(),
        status: z.enum(["APPROVED", "REJECTED"]),
        comment: z.string().optional(),
      }),
      execute: async ({ reviewId, status, comment }) => {
        const review = await db.proposalReview.findUnique({
          where: { id: reviewId },
          include: { proposal: true },
        });
        if (
          !review ||
          !assertWorkspaceMatch(review.proposal.workspaceId, ctx.workspace.id)
        ) {
          return { ok: false as const, error: "not found" };
        }
        if (review.reviewerId !== ctx.userId) {
          return {
            ok: false as const,
            error: "Only the assigned reviewer may decide this step",
          };
        }
        if (review.status !== "PENDING") {
          return { ok: false as const, error: "Review already decided" };
        }
        const prior = await db.proposalReview.findMany({
          where: {
            proposalId: review.proposalId,
            stepIndex: { lt: review.stepIndex },
          },
        });
        if (prior.some((p) => p.status !== "APPROVED")) {
          return {
            ok: false as const,
            error: "Previous approval steps are not complete",
          };
        }
        const updated = await db.proposalReview.update({
          where: { id: reviewId },
          data: {
            status,
            comment: comment ?? null,
            decidedAt: new Date(),
          },
        });
        if (status === "REJECTED") {
          await db.generatedProposal.update({
            where: { id: review.proposalId },
            data: { status: "REJECTED" },
          });
        } else {
          const remaining = await db.proposalReview.count({
            where: { proposalId: review.proposalId, status: "PENDING" },
          });
          if (remaining === 0) {
            await db.generatedProposal.update({
              where: { id: review.proposalId },
              data: { status: "APPROVED", approvedAt: new Date() },
            });
          }
        }
        return { ok: true as const, review: updated };
      },
    }),

    getBillingStatus: platformTool({
      description:
        "Subscription, plan list, and payment status (no bid pricing advice).",
      inputSchema: z.object({}),
      execute: async () => {
        const [plans, subscription, records] = await Promise.all([
          db.subscriptionPlan.findMany({
            where: { isActive: true, isPublic: true },
            orderBy: { priceMonthly: "asc" },
            select: {
              id: true,
              name: true,
              nameAr: true,
              priceMonthly: true,
              currency: true,
            },
          }),
          db.subscription.findUnique({
            where: { userId: ctx.userId },
            include: {
              plan: {
                select: { id: true, name: true, nameAr: true },
              },
            },
          }),
          db.billingRecord.findMany({
            where: { userId: ctx.userId },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              amount: true,
              currency: true,
              status: true,
              createdAt: true,
            },
          }),
        ]);
        return {
          plans,
          subscription,
          recentRecords: records,
          note: "Platform billing only — never use this for tender bid pricing.",
        };
      },
    }),

    getAccountProfile: platformTool({
      description: "Account/onboarding and brand profile snapshot.",
      inputSchema: z.object({}),
      execute: async () => {
        const brand = ctx.brandProfile;
        const onboarding = await db.onboardingProgress.findUnique({
          where: { workspaceId: ctx.workspace.id },
        });
        return {
          user: {
            id: ctx.userId,
            name: ctx.session.user.name,
            email: ctx.session.user.email,
            role: ctx.session.user.role,
            locale: ctx.session.user.locale,
          },
          membershipRole: ctx.membershipRole,
          workspace: {
            id: ctx.workspace.id,
            name: ctx.workspace.name,
            nameAr: ctx.workspace.nameAr,
            crNumber: ctx.workspace.crNumber,
            vatNumber: ctx.workspace.vatNumber,
            plan: ctx.workspace.plan,
          },
          brandProfile: brand
            ? {
                id: brand.id,
                tagline: brand.tagline,
                taglineAr: brand.taglineAr,
                primaryColor: brand.primaryColor,
              }
            : null,
          onboarding: onboarding
            ? {
                restrictionsReviewed: onboarding.restrictionsReviewed,
                completedSteps: onboarding.completedSteps,
              }
            : null,
        };
      },
    }),

    adminOverview: platformTool({
      description: "Platform admin overview (admins only).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.isAdmin) return denyAdmin(ctx);
        const [users, workspaces, providers, subscriptions] = await Promise.all([
          db.user.count(),
          db.workspace.count(),
          db.aIProviderConfig.count({ where: { isActive: true } }),
          db.subscription.count({ where: { status: "ACTIVE" } }),
        ]);
        return {
          ok: true as const,
          users,
          workspaces,
          activeProviders: providers,
          activeSubscriptions: subscriptions,
        };
      },
    }),

    adminListAiProviders: platformTool({
      description: "List configured AI providers (admins only).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.isAdmin) return denyAdmin(ctx);
        const providers = await db.aIProviderConfig.findMany({
          orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
          select: {
            id: true,
            name: true,
            provider: true,
            engine: true,
            modelId: true,
            isActive: true,
            priority: true,
            apiBase: true,
          },
        });
        return { ok: true as const, providers };
      },
    }),

    adminListAudit: platformTool({
      description: "Recent audit events (admins only).",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ limit }) => {
        if (!ctx.isAdmin) return denyAdmin(ctx);
        const events = await db.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: limit ?? 20,
          select: {
            id: true,
            action: true,
            resource: true,
            resourceId: true,
            userId: true,
            createdAt: true,
          },
        });
        return { ok: true as const, events };
      },
    }),

    listMissionAttachments: platformTool({
      description: "List files and captures staged in the current Mission Control session.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.missionId) {
          return { ok: false as const, error: "No active mission" };
        }
        const attachments = await db.copilotAttachment.findMany({
          where: { missionId: ctx.missionId, workspaceId: ctx.workspace.id },
          orderBy: { createdAt: "desc" },
          take: 40,
        });
        return { ok: true as const, attachments };
      },
    }),

    ingestDroppedFile: platformTool({
      description:
        "Ingest dropped/pasted file text (or base64 UTF-8 content) into Mission Control, classify, and auto-route when confident. Prefer the Mission Control drop zone for binary PDFs/ZIPs.",
      inputSchema: z.object({
        fileName: z.string().min(1),
        text: z.string().min(1).describe("Extracted or pasted file text"),
        mimeType: z.string().optional(),
        source: z
          .enum(["upload", "paste", "browser", "email", "drive", "camera"])
          .optional(),
      }),
      execute: async ({ fileName, text, mimeType, source }) => {
        if (!ctx.canWrite) return denyWrite(ctx);
        if (!ctx.missionId) return { ok: false as const, error: "No active mission" };
        const { stageMissionAttachment } = await import("./stage-attachment");
        const staged = await stageMissionAttachment({
          missionId: ctx.missionId,
          workspaceId: ctx.workspace.id,
          userId: ctx.userId,
          locale: ctx.locale,
          canWrite: ctx.canWrite,
          activeProjectId: ctx.activeProjectId,
          originalName: fileName,
          mimeType: mimeType || "text/plain",
          bytes: Buffer.from(text, "utf8"),
          source: source || "upload",
          textPreview: text.slice(0, 4000),
          autoRoute: true,
        });
        return {
          ok: true as const,
          attachmentId: staged.attachment.id,
          documentId: staged.document.id,
          decision: staged.decision,
          autopilot: staged.autopilot,
          uiAction: "navigate" as const,
          view:
            staged.autopilot?.mode === "autopilot"
              ? ("agents" as const)
              : ("documents" as const),
          projectId:
            staged.autopilot && "projectId" in staged.autopilot
              ? staged.autopilot.projectId
              : staged.attachment.projectId,
        };
      },
    }),

    classifyAndRouteAttachment: platformTool({
      description:
        "Re-classify a staged Mission Control attachment and run adaptive autopilot / routing.",
      inputSchema: z.object({
        attachmentId: z.string().min(1),
        forcePipeline: z.boolean().optional(),
      }),
      execute: async ({ attachmentId, forcePipeline }) => {
        if (!ctx.canWrite) return denyWrite(ctx);
        if (!ctx.missionId) return { ok: false as const, error: "No active mission" };
        const attachment = await db.copilotAttachment.findFirst({
          where: {
            id: attachmentId,
            missionId: ctx.missionId,
            workspaceId: ctx.workspace.id,
          },
        });
        if (!attachment) {
          return { ok: false as const, error: "Attachment not found" };
        }
        if (!attachment.documentId) {
          return { ok: false as const, error: "Attachment has no document" };
        }
        const { classifyAttachment } = await import("./classify-attachment");
        const { maybeAutopilotAfterIngest } = await import("./autopilot");
        const decision = classifyAttachment({
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          textPreview: attachment.textPreview,
          source: attachment.source as
            | "upload"
            | "url"
            | "camera"
            | "browser"
            | "email"
            | "drive"
            | "paste",
        });
        if (forcePipeline && decision.category === "RFP") {
          decision.confidence = Math.max(decision.confidence, 0.9);
          decision.runPipeline = true;
          decision.createProject = true;
          decision.clarifyingQuestion = null;
        }
        await db.copilotAttachment.update({
          where: { id: attachment.id },
          data: {
            docCategory: decision.category,
            confidence: decision.confidence,
            classificationJson: JSON.stringify(decision),
          },
        });
        const autopilot = await maybeAutopilotAfterIngest({
          workspaceId: ctx.workspace.id,
          userId: ctx.userId,
          locale: ctx.locale,
          attachmentId: attachment.id,
          documentId: attachment.documentId,
          decision,
          activeProjectId: ctx.activeProjectId ?? attachment.projectId,
          canWrite: ctx.canWrite,
        });
        return {
          ok: true as const,
          attachmentId: attachment.id,
          decision,
          autopilot,
          uiAction: "navigate" as const,
          view:
            autopilot.mode === "autopilot"
              ? ("agents" as const)
              : ("documents" as const),
          projectId:
            "projectId" in autopilot ? autopilot.projectId : attachment.projectId,
        };
      },
    }),

    ingestUrl: platformTool({
      description:
        "Fetch a public URL into Mission Control, classify it, and autonomously route / autopilot when confident.",
      inputSchema: z.object({
        url: z.string().url(),
      }),
      execute: async ({ url }) => {
        if (!ctx.canWrite) return denyWrite(ctx);
        if (!ctx.missionId) return { ok: false as const, error: "No active mission" };
        const { fetchUrlAsAttachment } = await import("./connectors");
        const { stageMissionAttachment } = await import("./stage-attachment");
        const fetched = await fetchUrlAsAttachment(url);
        const staged = await stageMissionAttachment({
          missionId: ctx.missionId,
          workspaceId: ctx.workspace.id,
          userId: ctx.userId,
          locale: ctx.locale,
          canWrite: ctx.canWrite,
          activeProjectId: ctx.activeProjectId,
          originalName: fetched.originalName,
          mimeType: fetched.mimeType,
          bytes: fetched.bytes,
          source: "url",
          textPreview: fetched.textPreview,
          autoRoute: true,
        });
        return {
          ok: true as const,
          attachmentId: staged.attachment.id,
          documentId: staged.document.id,
          decision: staged.decision,
          autopilot: staged.autopilot,
          uiAction: "navigate" as const,
          view:
            staged.autopilot?.mode === "autopilot"
              ? ("agents" as const)
              : ("documents" as const),
          projectId:
            staged.autopilot && "projectId" in staged.autopilot
              ? staged.autopilot.projectId
              : staged.attachment.projectId,
        };
      },
    }),

    captureClientArtifact: platformTool({
      description:
        "Stage pasted/captured client text (browser page or note) into Mission Control and auto-route when possible.",
      inputSchema: z.object({
        text: z.string().min(1),
        fileName: z.string().optional(),
        source: z.enum(["paste", "browser", "email"]).optional(),
      }),
      execute: async ({ text, fileName, source }) => {
        if (!ctx.canWrite) return denyWrite(ctx);
        if (!ctx.missionId) return { ok: false as const, error: "No active mission" };
        const { stageMissionAttachment } = await import("./stage-attachment");
        const staged = await stageMissionAttachment({
          missionId: ctx.missionId,
          workspaceId: ctx.workspace.id,
          userId: ctx.userId,
          locale: ctx.locale,
          canWrite: ctx.canWrite,
          activeProjectId: ctx.activeProjectId,
          originalName: fileName || "capture.txt",
          mimeType: "text/plain",
          bytes: Buffer.from(text, "utf8"),
          source: source || "paste",
          textPreview: text.slice(0, 4000),
          autoRoute: true,
        });
        return {
          ok: true as const,
          attachmentId: staged.attachment.id,
          decision: staged.decision,
          autopilot: staged.autopilot,
        };
      },
    }),

    searchDocumentChunks: platformTool({
      description: "Search indexed document chunks for a project or the whole workspace.",
      inputSchema: z.object({
        query: z.string().min(2),
        projectId: z.string().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ query, projectId, limit }) => {
        const q = query.toLowerCase();
        const chunks = await db.documentChunk.findMany({
          where: {
            workspaceId: ctx.workspace.id,
            ...(projectId ? { projectId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            id: true,
            documentId: true,
            projectId: true,
            chunkIndex: true,
            content: true,
          },
        });
        const hits = chunks
          .filter((c) => c.content.toLowerCase().includes(q))
          .slice(0, limit ?? 8)
          .map((c) => ({
            ...c,
            excerpt: c.content.slice(0, 400),
          }));
        return { ok: true as const, hits, totalScanned: chunks.length };
      },
    }),

    undoLastRouting: platformTool({
      description:
        "Undo the latest reversible Mission Control routing action (within the undo window).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.canWrite) return denyWrite(ctx);
        if (!ctx.missionId) return { ok: false as const, error: "No active mission" };
        const action = await db.copilotAction.findFirst({
          where: {
            missionId: ctx.missionId,
            reversible: true,
            status: "SUCCEEDED",
          },
          orderBy: { createdAt: "desc" },
        });
        if (!action) return { ok: false as const, error: "Nothing to undo" };
        const ageMs = Date.now() - action.createdAt.getTime();
        if (ageMs > 30_000) {
          return { ok: false as const, error: "Undo window expired (30s)" };
        }
        const output = action.outputJson
          ? (JSON.parse(action.outputJson) as { attachmentId?: string })
          : {};
        if (output.attachmentId) {
          await db.copilotAttachment.update({
            where: { id: output.attachmentId },
            data: { routeStatus: "UNDONE", projectId: null },
          });
        }
        await db.copilotAction.update({
          where: { id: action.id },
          data: { status: "UNDONE" },
        });
        return { ok: true as const, undoneActionId: action.id };
      },
    }),

    importExternalSource: platformTool({
      description:
        "Import from email/Drive connectors or acknowledge Chrome extension captures. v1 accepts pasted content while OAuth connectors remain stubs; Chrome extension uses /api/platform-agent/extension/ingest.",
      inputSchema: z.object({
        connector: z.enum([
          "email",
          "google_drive",
          "onedrive",
          "chrome_extension",
        ]),
        text: z.string().optional(),
        note: z.string().optional(),
      }),
      execute: async ({ connector, text, note }) => {
        if (connector === "chrome_extension") {
          return {
            ok: true as const,
            connector,
            status: "ready",
            note:
              note ||
              "Use Smart Install in Mission Control (Download ZIP → Load unpacked arabclue-agent). Captures land via extension ingest.",
            uiAction: "navigate" as const,
            view: "copilot" as const,
          };
        }
        if (!text?.trim()) {
          return {
            ok: false as const,
            error: `${connector} OAuth is not connected yet. Paste the email/file text and retry.`,
            connector,
            status: "stub",
          };
        }
        if (!ctx.canWrite) return denyWrite(ctx);
        if (!ctx.missionId) return { ok: false as const, error: "No active mission" };
        const { stageMissionAttachment } = await import("./stage-attachment");
        const staged = await stageMissionAttachment({
          missionId: ctx.missionId,
          workspaceId: ctx.workspace.id,
          userId: ctx.userId,
          locale: ctx.locale,
          canWrite: ctx.canWrite,
          activeProjectId: ctx.activeProjectId,
          originalName: `${connector}-import.txt`,
          mimeType: "text/plain",
          bytes: Buffer.from(text, "utf8"),
          source: connector === "email" ? "email" : "drive",
          textPreview: text.slice(0, 4000),
          autoRoute: true,
        });
        return {
          ok: true as const,
          connector,
          note: note ?? null,
          attachmentId: staged.attachment.id,
          decision: staged.decision,
          autopilot: staged.autopilot,
        };
      },
    }),
  };
}

export type PlatformTools = ReturnType<typeof createPlatformTools>;
