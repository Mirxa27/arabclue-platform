# Proposal Document Studio + Production Ops Design

**Date:** 2026-07-22  
**Status:** Approved (user: Proceed / C both / regenerate = version + fork)  
**Branch:** `cursor/production-completion-ab64`

## Goal

Make enhanced document generation, update, redesign skills, and operational controls fully live: a coherent Proposal Document Studio plus production-ops reliability so writers can generate → edit/redesign → version → review → export without dead ends.

## Scope A — Proposal Document Studio

### Architecture

Modular services on existing `GeneratedProposal` / `ProposalVersion` / agent pipeline:

| Unit | Responsibility |
| --- | --- |
| `proposal-studio.ts` | Version compare/revert, lineage, export policy, skill catalog |
| `proposal-skills` (prompts) | Rewrite / expand / condense / translate / redesign / section regenerate |
| Version APIs | Mirror document versioning (compare, revert) |
| Regenerate API | `mode=version` updates same proposal; `mode=fork` creates child with lineage |
| Enhanced editor UI | Versions, validation report, apply skills, regenerate controls |
| Reviews queue | Open proposal in studio |
| Agent workflow | Post-run CTA to studio + coverage/validation summary |

### Regenerate semantics (approved option C)

- **version:** Re-run agents; overwrite active proposal content as new `ProposalVersion`; preserve id, reviews reset to draft/generated.
- **fork:** Create new proposal linked via `parentProposalId`; prior proposal unchanged.

### Skills (live tools)

| Skill | Behavior |
| --- | --- |
| `rewrite` | Government-formal clarity |
| `expand` | Add evaluator-facing detail without inventing evidence |
| `condense` | Tighten while keeping requirement coverage |
| `translate` | AR↔EN preserving facts |
| `redesign` | Restructure headings/tables/outline for scorability |
| `section` | Regenerate a selected section only |

All skills: preview → apply → version snapshot. No pricing. Evidence-only.

### Export policy

Final formats (`zip`, `pdf`, `pptx`, `xlsx-*`) require:

1. Validation gate pass (existing)
2. Status `APPROVED` when workspace has an approval policy with steps; otherwise allow `GENERATED`/`REVIEWED`/`APPROVED`
3. Successful ZIP sets status `EXPORTED`
4. `html` / `manifest` remain preflight (validation still reported, approval not required for html)

### Human BoQ prices

Validation must not treat human-entered BoQ amounts as AI-priced (`source: "human"` exempt).

### Errors

- 422 validation with issue codes shown in editor
- 409 approval required for final export
- 503 skill unavailable (LLM fallback)
- Explicit gaps listed; never fabricate experience

### Testing

Unit tests: version compare/revert helpers, skill prompt catalog, export policy, regenerate mode lineage, human BoQ exemption.

## Scope B — Production operations

| Unit | Responsibility |
| --- | --- |
| Agent run `configJson` | Persist locale/workspace/user/mode/target for resume |
| Resume on status poll | If QUEUED/RUNNING stale without progress, restart pipeline from checkpoint |
| `/api/ready` | Surface LLM provider active config presence (not secrets) |
| Agent UI | Surface proposalId, coverage %, validation blocking, Open studio |
| Ops docs | Update IMPLEMENTATION_STATUS / AI-SYSTEM / GAP_ANALYSIS |

### Out of scope (unchanged)

Etimad portal submit, Redis/Bull, SSO, live MyFatoorah without merchant credentials.

## Data model additions

```
GeneratedProposal.parentProposalId String?
AgentRun.configJson String?
```

## Success criteria

1. Writer can generate, edit, apply AI skill, compare/revert versions, regenerate as version or fork.
2. Reviewer can open proposal from reviews queue; approve; writer exports ZIP only when approved (if policy exists).
3. Export errors surface in studio; EXPORTED status set on ZIP.
4. Agent run config is durable; stale runs can resume.
5. Tests and build pass.
