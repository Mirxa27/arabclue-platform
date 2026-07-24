# Document Generation: Phases 3–6

This document describes the implemented Phase 3–6 document-generation
surfaces as of 2026-07-24. It is an API and integration reference, not a claim
that a generated contract has received legal approval, that every declared
output channel has a writer, or that the output has been certified in every
browser or office application.

Phase 2 is the shared rendering foundation. See
[Bilingual Layout Engine](./bilingual-layout-engine.md) for its AST, layout,
typography, HTML, and PDF APIs.

## Architecture

The four phases use the same fail-closed pattern:

```text
verified source records or immutable snapshots
  -> schema and provenance validation
  -> deterministic catalog, plan, or bilingual AST
  -> explicit export gate
  -> channel-specific renderer
```

| Phase | Source model | Validated intermediate form | Implemented output boundary |
| --- | --- | --- | --- |
| 3: Contract templates | Explicit template bindings | `BoundContractDocument`, then `BilingualDocumentSpec` | Draft HTML and font-embedded draft PDF |
| 4: Proposal layouts | Canonical, revisioned `ProposalSnapshot` with immutable evidence bindings | `CompiledProposalLayout`, then the Phase 2 bilingual AST for document channels | Authenticated HTML, font-embedded PDF, and native PPTX |
| 5: Tables and charts | Structured table/chart definitions | `PreparedDocumentTable` or normalized chart geometry | Escaped HTML table and accessible SVG plus data-table fallback |
| 6: Capability statements | `BusinessProfileSnapshot` | `CapabilityStatementBuildResult` containing a `BilingualDocumentSpec` | Authenticated HTML/PDF business-profile export |

The modules accept structured data, not authored HTML. They do not translate
missing text, invent evidence, calculate commercial values, or infer legal
approval. Canonical hashes make changes detectable; they are not digital
signatures and do not prove that source content is true.

## Phase 3: Contract Template System

Sources:

- [Contract catalog and binding API](../src/lib/document-templates/contract-templates.ts)
- [Bilingual contract renderer](../src/lib/document-templates/contract-template-renderer.ts)
- [Draft persistence service](../src/lib/contract-template-persistence.ts)
- [Distributed draft-write admission](../src/lib/contract-draft-admission.ts)
- [Tenant draft collection route](../src/app/api/contracts/drafts/route.ts)
- [Tenant draft read/delete route](../src/app/api/contracts/drafts/%5Bid%5D/route.ts)
- [Pending draft-persistence migration](../prisma/migrations/20260725003000_contract_draft_persistence/migration.sql)
- [Catalog and binding tests](../src/lib/__tests__/contract-templates.test.ts)
- [Renderer and live PDF tests](../src/lib/__tests__/contract-template-renderer.test.ts)
- [Persistence tests](../src/lib/__tests__/contract-template-persistence.test.ts)
- [Transactional persistence tests](../src/lib/__tests__/contract-template-persistence-db.test.ts)
- [Route tests](../src/lib/__tests__/contract-draft-route.test.ts)
- [Admission tests](../src/lib/__tests__/contract-draft-admission.test.ts)
- [Migration invariant tests](../src/lib/__tests__/contract-draft-migration.test.ts)

### Catalog

The frozen catalog contains seven versioned template families and 33 reusable
bilingual clauses:

| Template key | Intended drafting family |
| --- | --- |
| `it-services-v1` | IT implementation, integration, and managed services |
| `goods-supply-v1` | Equipment and product supply |
| `professional-services-v1` | Consulting and advisory services |
| `nda-v1` | Mutual or unilateral confidentiality arrangements |
| `subcontract-v1` | Prime-contractor and subcontractor delivery |
| `framework-calloff-v1` | Recurring framework and call-off work |
| `saas-data-v1` | SaaS subscriptions and data schedules |

Every template and clause has:

- lifecycle `DRAFT`;
- legal-review status `UNREVIEWED`;
- `counselReviewRequired: true`;
- bilingual text with unspecified language precedence;
- a deterministic `versionId` and `canonicalHash`; and
- pending official-source review rather than seeded statutory citations.

The catalog does not seed tender-specific prices, penalties, or percentages.

### Binding model

`TemplateVariableDefinition` describes each variable's type, required status,
source policy, validation bounds, and direction policy.

- `LOCALIZED` values require independently supplied `en` and `ar` strings or
  lists. A missing locale is an error; one language is never copied into the
  other.
- `DIRECTION_NEUTRAL` is limited to values that are semantically identical in
  both columns, such as identifiers, entities, dates, booleans, numbers, and
  money.
- Money is `{ amount: number, currency: string }`, with a finite non-negative
  amount and a three-letter uppercase currency.
- Dates use the `YYYY-MM-DD` calendar form.
- Raw markup, unresolved token syntax, control characters, and bidi override
  characters are rejected.

`PREVIEW` may return `READY_WITH_DIAGNOSTICS` and visible structured
placeholders. `FINAL` blocks when any error remains. In this API, `FINAL` means
variable-complete; the resulting document still remains a visibly unreviewed
draft.

### Public API

| Export | Contract |
| --- | --- |
| `CONTRACT_TEMPLATE_KEYS`, `CONTRACT_CLAUSE_IDS` | Stable key lists for catalog discovery. |
| `CONTRACT_TEMPLATE_CATALOG`, `CONTRACT_CLAUSE_CATALOG` | Deep-frozen template and clause definitions. |
| `getContractTemplate(key)` | Returns a known frozen template or `undefined`; prototype-chain names are not accepted. |
| `getContractClause(id)` | Returns a known frozen clause or `undefined`. |
| `computeCanonicalHash(value)` | Returns a deterministic `sha256:` hash for finite JSON-compatible plain data. It throws for cycles, accessors, symbols, non-finite numbers, and unsupported objects. |
| `computeContractTemplateHash(template)` | Recomputes a template hash without recursively including its stored hash. |
| `bindContractTemplate(key, bindings, options)` | Validates values and returns `READY`, `READY_WITH_DIAGNOSTICS`, or `BLOCKED`. |
| `compileContractTemplateDocument(key, bindings, options)` | Binds a template and converts a non-blocked result into the validated bilingual AST. |
| `renderContractTemplateDocumentHTML(compilation, options?)` | Renders the same draft AST used by PDF. Throws `ContractTemplateRenderError` for blocked compilations. |
| `generateContractTemplateDocumentPdf(compilation, options?)` | Generates a `BilingualPdfArtifact`; blocked compilations throw `ContractTemplateRenderError`. |
| `BindingDiagnostic` and `ContractTemplateDocumentCompilation` | Typed status and diagnostic unions for exhaustive handling. |

Binding diagnostics are:

`UNKNOWN_TEMPLATE`, `UNKNOWN_VARIABLE`, `MISSING_REQUIRED_VARIABLE`,
`OPTIONAL_VARIABLE_OMITTED`, `MISSING_BINDING_LOCALE`,
`INVALID_VARIABLE_TYPE`, and `UNSAFE_BINDING_VALUE`.

### Example: render a variable-complete draft

```typescript
import {
  compileContractTemplateDocument,
  generateContractTemplateDocumentPdf,
  renderContractTemplateDocumentHTML,
} from "@/lib/document-templates/contract-template-renderer";
import type { TemplateBindingValue } from "@/lib/document-templates/contract-templates";

export async function renderVariableCompleteDraft(
  templateKey: string,
  verifiedBindings: Readonly<Record<string, TemplateBindingValue>>
) {
  const compilation = compileContractTemplateDocument(
    templateKey,
    verifiedBindings,
    { mode: "FINAL" }
  );

  if (compilation.status === "BLOCKED") {
    return { ok: false as const, diagnostics: compilation.diagnostics };
  }

  const html = renderContractTemplateDocumentHTML(compilation);
  const pdf = await generateContractTemplateDocumentPdf(compilation);
  return { ok: true as const, html, pdf: pdf.pdf };
}
```

Supply localized narrative values independently:

```typescript
import type { TemplateBindingValue } from "@/lib/document-templates/contract-templates";

const localizedBindingFragment = {
  "input.scopeDescription": {
    en: "Verified English scope.",
    ar: "نطاق عربي موثق ومستقل.",
  },
  "input.governanceContacts": {
    en: ["English owner", "English approver"],
    ar: ["المالك العربي", "المعتمد العربي"],
  },
} satisfies Record<string, TemplateBindingValue>;
```

This fragment is not a complete template binding. Inspect
`getContractTemplate(templateKey)?.variables` and supply every required value
from verified project, workspace, approved-knowledge, or explicit user-entry
sources before using `FINAL`.

### Draft persistence API

The catalog dashboard can persist an authoring draft without changing its
legal state. The server does not trust a client-authored AST, HTML document,
template body, or clause body. It accepts only bindings plus the catalog
identity the caller saw, then recompiles from the frozen server catalog.

```text
POST /api/contracts/drafts
GET  /api/contracts/drafts?projectId=<optional>&limit=25&cursor=<optional>
GET  /api/contracts/drafts/<id>
DELETE /api/contracts/drafts/<id>
```

Example writer request:

```json
{
  "templateKey": "nda-v1",
  "expectedVersionId": "nda-v1@1",
  "expectedCanonicalHash": "sha256:<64 lowercase hex characters>",
  "clientRequestId": "11111111-1111-4111-8111-111111111111",
  "mode": "PREVIEW",
  "bindings": {},
  "projectId": null
}
```

The request body limit is 512 KiB, and the four serialized generated fields
(`dataJson`, `clausesJson`, `documentSpecJson`, and `contentHtml`) have a
combined 4 MiB post-compilation limit. This second check prevents a small
binding request from expanding into an unbounded persisted/rendered result.
Unknown fields, invalid JSON, stale template identity, a project outside the
active workspace, blocked compilation, and oversized compiled output are
rejected before a write. `clientRequestId` is unique inside a workspace:
repeating the same request is idempotent, while reusing it for different
content fails with `409`.

Before compilation, the writer route checks both a user bucket (30 writes) and
a workspace bucket (120 writes) in a ten-minute window. Production and Vercel
require the shared Redis backend and fail closed with `503` and `Retry-After`
when it is unavailable; an exhausted bucket returns `429`. In-memory admission
is used only outside those production modes.

Active draft count and serialized storage are also bounded by the workspace
plan:

| Plan | Active drafts | Draft storage |
| --- | ---: | ---: |
| `STARTER` (and unknown/fail-safe fallback) | 50 | 64 MiB |
| `PRO` | 250 | 256 MiB |
| `ENTERPRISE` | 1,000 | 1 GiB |
| `PAY_AS_YOU_GO` | 100 | 128 MiB |

The plan quota is checked in the same serializable transaction as creation, so
concurrent writes cannot exceed it. A quota rejection returns `429`. A writer
can recover both count and storage with tenant-scoped `DELETE`; only
generation-schema version 1 rows that are still unreviewed, counsel-required,
non-executable drafts with no PDF path are eligible. Deletion and
`CONTRACT_DRAFT_DELETE` audit creation commit atomically.

Persistence and admission exports:

| Export | Contract |
| --- | --- |
| `contractDraftWriteSchema` | Strictly validates a binding-only draft request and normalizes its UUID request id. |
| `contractDraftListQuerySchema` | Validates project, bounded limit, and optional keyset cursor filters. |
| `prepareContractDraft(input)` | Recompiles from the frozen catalog, serializes the result once, enforces the 4 MiB output budget, and returns canonical draft metadata. |
| `contractDraftSerializedBytes(input)` | Returns the UTF-8 byte total of the four persisted generated fields. |
| `assertContractDraftSerializedOutputBudget(input, maxBytes?)` | Returns the byte total or throws `CONTRACT_DRAFT_OUTPUT_TOO_LARGE` (`413`). |
| `persistPreparedContractDraft(input, database?)` | Performs project revalidation, catalog/version synchronization, idempotency, plan quota enforcement, creation, integrity validation, and audit append in a serializable transaction. |
| `listPersistedContractDrafts(input, database?)` | Returns a narrow, keyset-paginated summary page plus excluded-integrity count and `nextCursor`. |
| `loadPersistedContractDraft(input, database?)` | Tenant-loads one full source record and fails closed on AST, byte-count, catalog, safety, or hash drift. |
| `deletePersistedContractDraft(input, database?)` | Atomically audits and deletes one tenant-scoped, unreviewed, non-executable catalog draft. |
| `admitContractDraftWrite(input, options?)` | Applies distributed user/workspace admission and production fail-closed behavior. |

For every successful creation, one serializable database transaction:

1. syncs a workspace catalog row with `catalogKey`, without updating an
   existing row;
2. verifies its exact canonical hash and serialized sections, variables,
   clauses, provenance, and unreviewed state;
3. inserts or reuses the immutable `templateId + versionId` row and performs
   the same drift checks;
4. checks the plan's active-count and serialized-storage budgets;
5. stores bindings, bound clauses, rendered HTML, the bilingual AST,
   `templateVersionId`, generation mode, diagnostic count, exact storage byte
   count, and a canonical hash covering all generated values;
6. forces `UNREVIEWED`, `counselReviewRequired = true`,
   `isExecutable = false`, `status = draft`, and no PDF path; and
7. appends `CONTRACT_DRAFT_CREATE` to the audit log atomically with creation.

`PREVIEW` drafts may contain structured placeholders and diagnostics.
`FINAL` persists only when binding is variable-complete, but still means
unreviewed and non-executable. There is deliberately no approval, publish, or
execution mutation in this API.

The list route uses deterministic keyset pagination (`createdAt DESC`, then
`id DESC`), returns at most 50 records, and exposes `nextCursor` when another
page exists. Its Prisma projection reads only bounded scalar summary and
template-identity fields: it does not select or parse bindings, clauses, HTML,
or the document AST. Full AST validation, serialized-byte verification, and
canonical-hash recomputation are reserved for the single-record read route.
The dashboard turns returned HTML source into a downloaded file rather than
injecting it into the application DOM. It exposes bilingual, confirmed
deletion for quota recovery and follows `nextCursor` with an explicit
load-more control, so older drafts remain reachable.

## Phase 4: Proposal Layouts and Structured Export

Sources:

- [Proposal layout API](../src/lib/proposal-layouts.ts)
- [HTML/PDF/PPTX adapter](../src/lib/proposal-layout-export.ts)
- [Snapshot persistence and export policy](../src/lib/proposal-snapshot-persistence.ts)
- [Tenant evidence resolver](../src/lib/proposal-snapshot-evidence.ts)
- [Server identity binding](../src/lib/proposal-snapshot-identity.ts)
- [Explicit bilingual Markdown hydration](../src/lib/proposal-snapshot-hydration.ts)
- [Immutable contract render snapshots](../src/lib/contract-render-snapshot.ts)
- [Final approval-chain export gate](../src/lib/proposal-final-export.ts)
- [Snapshot HTTP route](../src/app/api/proposals/[id]/snapshot/route.ts)
- [Active download route](../src/app/api/proposals/[id]/download/route.ts)
- [Pending database migration](../prisma/migrations/20260724231500_proposal_structured_snapshot/migration.sql)
- [Pending contract render-snapshot migration](../prisma/migrations/20260725004000_contract_render_snapshot/migration.sql)
- [Layout and export tests](../src/lib/__tests__/proposal-layouts.test.ts)
- [Persistence tests](../src/lib/__tests__/proposal-snapshot-persistence.test.ts)
- [Evidence resolver tests](../src/lib/__tests__/proposal-snapshot-evidence.test.ts)
- [Route tests](../src/lib/__tests__/proposal-snapshot-route.test.ts)
- [Hydration tests](../src/lib/__tests__/proposal-snapshot-hydration.test.ts)
- [Identity tests](../src/lib/__tests__/proposal-snapshot-identity.test.ts)
- [Editor concurrency tests](../src/lib/__tests__/proposal-edit-precondition.test.ts)
- [Final export tests](../src/lib/__tests__/proposal-final-export.test.ts)
- [Contract render-snapshot tests](../src/lib/__tests__/contract-render-snapshot.test.ts)
- [Contract render-snapshot migration tests](../src/lib/__tests__/contract-render-snapshot-migration.test.ts)

### Presets and modules

The six frozen presets are `government-formal`, `executive-impact`,
`technical-deep-dive`, `compliance-evidence`, `bilingual-parallel`, and
`compact-addendum`. Each preset orders all 16 known module identities and marks
the required subset, role, orientation, rank, and channel treatment.

Intent selects a preset deterministically:

| `ProposalIntent` | Default preset |
| --- | --- |
| `FULL_SUBMISSION` | `government-formal` |
| `EXECUTIVE_REVIEW` | `executive-impact` |
| `TECHNICAL_EVALUATION` | `technical-deep-dive` |
| `COMPLIANCE_RESPONSE` | `compliance-evidence` |
| `BILINGUAL_SUBMISSION` | `bilingual-parallel` |
| `ADDENDUM` | `compact-addendum` |

A `ProposalSnapshot` carries its bilingual project identity, brand colors,
source registry, and module blocks. Blocks may be narrative, bullet list,
table, KPI, evidence register, commercial handoff, or diagram. References are
resolved against the snapshot's explicit source registry.

`APPROVED_KNOWLEDGE` is a privileged source kind at the persistence boundary.
It must exactly match a currently eligible record in the caller's workspace,
including record type, canonical content hash, evidence pointer, reviewer,
approval timestamp, and uploaded-document provenance version/checksum. Its
title, locator, and `asOf` value must also match the server-derived binding.
The binding is re-resolved on snapshot reads, submit, and export, so revocation,
expiry, a post-approval content edit, a changed record type, or later
re-approval under a different hash fails closed. `USER_ENTRY` remains explicit
draft input and cannot be labeled `VERIFIED`. The referenced tenant
`UploadedDocument` and exact `DocumentVersion` must still exist with the
captured name, version, and checksum. Reviewed evidence versions are protected
by database foreign keys and cannot be hard-deleted.

Project title, bidder identity, Etimad reference, and brand colors are bound to
the current tenant project, workspace, and brand profile on write, read,
submit, review, and export. Client-authored `TENDER` and `WORKSPACE` source
kinds are rejected until they carry an immutable server binding. Use
`USER_ENTRY` for unverified author input or `APPROVED_KNOWLEDGE` for reviewed
tenant evidence.

### Public API

| Export | Contract |
| --- | --- |
| `PROPOSAL_LAYOUT_KEYS`, `PROPOSAL_MODULE_KEYS` | Stable preset and module key lists. |
| `PROPOSAL_LAYOUT_PRESETS` | Deep-frozen plans for the six presets. |
| `PROPOSAL_CHANNEL_CAPABILITIES` | Explicit block support matrix with no implicit fallback. |
| `getProposalLayoutPreset(key)` | Returns a known preset or `undefined`. |
| `selectProposalLayout(snapshot, requested?)` | Chooses the explicit override or the intent-mapped preset. |
| `contrastRatio(first, second)` | Calculates the WCAG contrast ratio for intended six-digit hexadecimal inputs. |
| `resolveProposalPalette(input?)` | Normalizes colors, falls back to the default palette, and selects foregrounds with at least 4.5:1 contrast. Invalid supplied colors are also reported when a snapshot is validated. |
| `validateProposalSnapshot(snapshot, options)` | Returns sorted error diagnostics without changing the snapshot. |
| `compileProposalLayout(snapshot, options)` | Returns a deterministic `VALID` or `INVALID` channel plan, source/snapshot hash, plan hash, palette, modules, and diagnostics. It does not render content. |
| `generateProposalPptx(snapshot, options?)` | Validates and writes a real PPTX `Buffer`, or throws `ProposalLayoutValidationError` before producing a partial deck. |
| `compileProposalLayoutDocument(snapshot, options?)` | Converts a valid bilingual HTML/PDF plan into the Phase 2 AST without dropping content. |
| `exportProposalLayout(snapshot, options)` | Produces HTML, PDF, or PPTX from the authoritative snapshot; unsupported XLSX fails explicitly. |
| `canonicalizeProposalSnapshot(input, options)` | Strictly validates shape, proposal identity, optimistic version, and all three production channels, then returns canonical JSON/hash metadata. |
| `validatePersistedProposalSnapshot(input, metadata)` | Recomputes and compares the stored hash, revision, and preset before use. |
| `validateStructuredSnapshotEvidence(snapshot, bindings)` | Requires exact current tenant evidence bindings and rejects self-declared verified evidence. |
| `validateProposalSnapshotServerIdentity(snapshot, identity)` | Rejects forged or stale project, bidder, tender, brand, `TENDER`, and `WORKSPACE` identities. |
| `validateProposalDraftLanguageDirections(content)` | Requires Latin-script content on the English side and Arabic-script content on the Arabic side while allowing numbers and mixed technical terms. |
| `hydrateProposalSnapshotFromMarkdown(input)` | Positionally pairs explicit English and Arabic Markdown by classified module and block index; it never translates, semantically matches, or verifies the text. |
| `createContractRenderSnapshot(source, options)` | Captures and hashes the exact contract, project, workspace, brand, artifacts, milestones, and obligation register read during serializable submit. |
| `validatePersistedContractRenderSnapshot(input, metadata)` | Revalidates a stored contract snapshot's schema, proposal identity, byte budget, revision, and canonical hash. |
| `contractExportOptionsFromSnapshot(snapshot)` | Projects only frozen contract renderer inputs for final HTML, PDF, ZIP, and manifest generation. |
| `validateStructuredProposalOutput(snapshot, context)` | Projects exact renderable text into the existing pricing, placeholder, NORA, tender, restriction, and approved-evidence gate without rendering or inventing content. |
| `selectProposalDownloadEngine(hasSnapshot, format)` | Selects structured HTML/PDF/PPTX when a snapshot exists and never falls through to stale Markdown. |
| `hasCompleteBoundProposalApproval(proposal, reviews, expectedSteps)` | Requires the exact approval-policy step count, indices, reviewers, roles, all-approved decisions, and immutable submission binding before final export. |

The validator checks schema version, language parity, module/block identity,
required content, server identity, source references, brand colors, unsafe markup, unresolved
tokens, bidi controls, channel support, and commercial provenance. Populated
commercial values labeled `VERIFIED_SOURCE_VALUES` require exclusively current
`APPROVED_KNOWLEDGE` bindings. Tender, workspace, and explicit user-entry
amounts remain human-entered/unverified and must use `USER_ENTRY_REQUIRED`. The
engine does not calculate, round, or manufacture prices.

For PPTX, aggregated narrative, bullet-list, and table text is limited to 2,400
characters per language per block. Each rendered block becomes one slide with
English and Arabic columns. Source IDs plus snapshot and plan hashes are stored
in slide notes.

### Channel capability and current writers

| Block | HTML | PDF | PPTX | XLSX |
| --- | --- | --- | --- | --- |
| Narrative | Native | Native | Native | Manifest only |
| Bullet list | Native | Native | Native | Manifest only |
| Table | Native | Native | Native | Native |
| KPI | Native | Native | Native | Native |
| Evidence register | Native | Native | Native | Native |
| Commercial handoff | Native | Native | Native | Native |
| Diagram | Native | Native | Unsupported | Unsupported |

This matrix is both a validation and adapter contract for HTML, PDF, and PPTX.
HTML and PDF share the canonical Phase 2 bilingual AST; PDF embeds the
configured Arabic fonts through the Phase 2 PDF path. PPTX uses the native
PptxGenJS writer. Structured XLSX is not implemented and fails explicitly.
Diagram content remains blocked when a selected channel cannot safely resolve
or represent its asset.

The PPTX writer lays supported block content out as bilingual text. A `TABLE`
capability does not mean that the writer creates an editable PowerPoint table
shape. The file references Aptos and Noto Sans Arabic by name; it does not
embed those fonts. Office applications may substitute fonts, so visual QA in
the intended presentation application remains required.

### Example: validate and generate a deck

```typescript
import {
  ProposalLayoutValidationError,
  compileProposalLayout,
  generateProposalPptx,
  type ProposalSnapshot,
} from "@/lib/proposal-layouts";

export async function createProposalDeck(snapshot: ProposalSnapshot) {
  const plan = compileProposalLayout(snapshot, { channel: "PPTX" });
  if (plan.status === "INVALID") {
    throw new ProposalLayoutValidationError(plan.diagnostics);
  }

  return {
    planHash: plan.planHash,
    snapshotHash: plan.snapshotHash,
    bytes: await generateProposalPptx(snapshot),
  };
}
```

Persist or log the snapshot version, snapshot hash, plan hash, and selected
preset with the artifact. Do not silently drop an unsupported block; route it
to a supported channel or block export.

### Snapshot persistence HTTP API

`GET`, `PUT`, and `POST /api/proposals/:id/snapshot` are authenticated and
tenant scoped. `PUT` is the full structured-authoring API and requires writer
access with this strict body:

```json
{
  "snapshot": { "schemaVersion": 1, "snapshotId": "proposal-id" },
  "expectedRevision": 0,
  "presetKey": "compact-addendum"
}
```

The abbreviated snapshot above is illustrative only and will be rejected;
every required bilingual source, module, and block must be supplied.

- `snapshotId` must equal the URL proposal ID.
- `snapshot.version` must equal `expectedRevision + 1`.
- The request is limited to 1,000,000 UTF-8 bytes and rejects unknown fields.
- Replacement uses an atomic workspace, status, snapshot revision, proposal
  version, proposal update timestamp, locale, and exact Markdown comparison.
- A successful replacement clears the prior review chain and resets proposal
  approval/submission state to `DRAFT`.
- Any Markdown, title, locale, AI rewrite, version revert, financial-form, or
  regenerate mutation clears the snapshot metadata and advances its revision.
- The response includes `X-Arabclue-Proposal-Engine: structured-v1`,
  `X-Proposal-Snapshot-Hash`, and `X-Proposal-Snapshot-Revision`.

`POST` is the production bridge used by the proposal editor. The persisted
editor language is one side and the writer must supply the complete explicit
counterpart:

```json
{
  "counterpartMd": "# العرض العربي\n\nمحتوى عربي راجعه المستخدم."
}
```

The endpoint never calls a translator. A coarse strong-script check rejects an
English-only Arabic counterpart, an Arabic-only English counterpart, empty
content, and same-language pairs; numbers and mixed technical terms remain
allowed. It classifies each section and then pairs blocks positionally by
module and index. This is structural coordination, not a claim of semantic
translation or equivalence. Mismatched counts and absent formal modules remain
visible not-available gaps. Both inputs are labeled `USER_ENTRY`.

The editor saves dirty Markdown first using required `expectedVersion` and
`expectedUpdatedAt` preconditions, calls this endpoint, and then submits the
resulting canonical snapshot. The hydration write repeats an exact
version/timestamp/locale/Markdown CAS, so a concurrent edit cannot install a
snapshot built from stale content. An existing explicitly authored structured
snapshot is preserved until a content edit invalidates it.

The active `GET /api/proposals/:id/download?format=html|pdf|pptx` route uses the
structured writer whenever the snapshot exists and emits its hash, revision,
preset, lifecycle, and authoritative-engine headers. A present but corrupt or
unsupported structured snapshot never falls back to legacy output. Approved
or exported non-contract proposals without a structured snapshot are blocked;
legacy output is retained only as an explicitly non-authoritative draft
preview when no snapshot exists. Final proposal HTML/PDF/PPTX and final
contract HTML/PDF/ZIP/manifest additionally require the exact current approval
policy chain: the step count, indices, assigned reviewers, roles, decisions,
and immutable submission binding must all match. Contract submission captures
a canonical v1 render snapshot in the same serializable transaction as the
review rows. Final contract outputs use only its frozen title/content/locale,
project identity, company registration fields, brand fields, artifacts,
milestones, and obligation register. Live project, workspace, brand, artifact,
or obligation changes cannot drift an approved artifact. Contract content and
obligation mutations clear the render snapshot, advance its revision, and
invalidate prior reviews. Blocking validation diagnostics reject every
approved/exported output format, including HTML and manifest. HTML and manifest
may bypass that gate only while authoring a draft, and those responses are
explicitly labeled `NON_AUTHORITATIVE_PREVIEW`.

The configured proposal approval roles are currently `TECHNICAL` and `FINAL`;
they do not designate or credential legal counsel. Contract UI therefore calls
this the configured approval workflow, never legal review. Even after that
workflow permits an immutable artifact export, contract manifests and response
headers remain explicit: `legalReviewStatus = UNREVIEWED`,
`counselReviewRequired = true`, and `isExecutable = false`. Platform
`APPROVED`/`EXPORTED` means the exact configured workflow approved that frozen
artifact; it is not legal sign-off and does not make the contract executable.

## Phase 5: Tables and Charts

Sources:

- [Table and chart API](../src/lib/document-visualizations.ts)
- [Visualization tests](../src/lib/__tests__/document-visualizations.test.ts)
- [Bilingual chart-block integration](../src/lib/bilingual-layout.tsx)

### Public API

| Export | Contract |
| --- | --- |
| `formatDocumentNumber(value, locale, format?)` | Formats a finite number with explicit English or Saudi Arabic digits and removes formatter-inserted bidi controls. |
| `prepareDocumentTable(input, options?)` | Validates, localizes, formats, chunks, and recommends portrait or landscape orientation. It returns one empty page when there are no rows. |
| `renderDocumentTable(input, options?)` | Returns the prepared model and escaped, semantic HTML with caption, repeated page headers, row/column header scopes, and `<bdi>` values. |
| `renderDocumentChart(input, options?)` | Returns deterministic SVG, a visible HTML data table, combined figure HTML, alt text, direction, and resolved axis/category ordering. |
| `DOCUMENT_VISUALIZATION_LIMITS` | Public hard limits for identifiers, labels, tables, charts, points, and value magnitude. |
| `CHART_PATTERN_KEYS` | Eight non-color patterns used for series/slice differentiation. |
| `DocumentVisualizationError` | Thrown with `code` (`INVALID_INPUT` or `LIMIT_EXCEEDED`) and a machine-readable `path`. |

Table columns are discriminated as `text`, `number`, or `boolean`. Number
formats are `number`, `integer`, `percent`, or `currency`. A cell must be a
string, finite number, boolean, or `null`, matching its column.

Charts support `bar`, `line`, and `pie` types. Categorical RTL charts reverse
the visual category order. Chronological axes always sort increasing values
from physical left to right, including inside RTL documents. Color is never
the only series distinction: patterns, line styles, and markers provide
non-color cues. The SVG has a title and description, and every chart includes
a visible data-table fallback.

The public limits are:

| Limit | Value |
| --- | ---: |
| Identifier length | 64 characters |
| Bilingual label length | 500 characters per value |
| Table columns | 20 |
| Table rows | 5,000 |
| Rows per page | 100 |
| Chart categories | 60 |
| Pie categories | 8 |
| Chart series | 8 |
| Total chart data points | 480 |
| Absolute numeric value | 1,000,000,000,000 |

### Example: render a localized table

```typescript
import {
  renderDocumentTable,
  type DocumentTableDefinition,
} from "@/lib/document-visualizations";

const scoreTable = {
  id: "evaluation_scores",
  title: { en: "Evaluation scores", ar: "درجات التقييم" },
  columns: [
    {
      id: "criterion",
      kind: "text",
      label: { en: "Criterion", ar: "المعيار" },
    },
    {
      id: "score",
      kind: "number",
      label: { en: "Score", ar: "الدرجة" },
      format: { style: "integer" },
    },
  ],
  rows: [
    {
      id: "technical",
      cells: { criterion: "Technical", score: 88 },
    },
  ],
} satisfies DocumentTableDefinition;

const { html, prepared } = renderDocumentTable(scoreTable, {
  locale: "ar",
  rowsPerPage: 28,
});

console.log(prepared.recommendedOrientation, html);
```

### Example: embed a safe chart in the bilingual AST

```typescript
import type { PairedChartBlock } from "@/lib/bilingual-layout";

const progressChart = {
  type: "chart",
  id: "delivery_progress",
  chart: {
    id: "delivery_progress_chart",
    type: "bar",
    title: { en: "Delivery progress", ar: "تقدم التنفيذ" },
    summary: {
      en: "Verified completion by workstream.",
      ar: "نسب الإنجاز الموثقة حسب مسار العمل.",
    },
    categories: [
      { id: "design", label: { en: "Design", ar: "التصميم" } },
      { id: "build", label: { en: "Build", ar: "التنفيذ" } },
    ],
    series: [
      {
        id: "completion",
        label: { en: "Completion", ar: "الإنجاز" },
        values: [0.8, 0.55],
        pattern: "diagonal",
        color: "#20639B",
      },
    ],
    valueFormat: { style: "percent" },
  },
} satisfies PairedChartBlock;
```

The bilingual renderer validates and renders a chart independently for English
LTR and Arabic RTL output. Do not concatenate arbitrary markup into the
returned HTML or SVG.

## Phase 6: Capability Statements

Sources:

- [Capability-statement adapter](../src/lib/capability-statement.ts)
- [Business-profile integration](../src/lib/business-profile.ts)
- [Authenticated export route](../src/app/api/business-profile/export/route.ts)
- [Adapter tests](../src/lib/__tests__/capability-statement.test.ts)
- [Business-profile library tests](../src/lib/__tests__/business-profile-bilingual.test.ts)
- [Export-route tests](../src/lib/__tests__/business-profile-export-route.test.ts)

### Document model and export policy

`buildCapabilityStatement` is a pure
`BusinessProfileSnapshot -> CapabilityStatementBuildResult` adapter. Its
parallel bilingual document contains nine stable sections:

1. cover and company identity;
2. verified statistics;
3. projects;
4. team;
5. certificates;
6. partnerships;
7. target sectors;
8. methodologies; and
9. readiness evidence.

Missing translations remain explicit placeholders and diagnostics; English is
not copied into Arabic. Shared identifiers, counts, percentages, and dates are
isolated as bidi-aware values. Unsafe bidi controls are removed. Remote logos
are omitted; accepted logo sources are trusted application-relative paths or
base64 PNG, JPEG, or WebP data images up to 8 MiB.

The default policy blocks missing translations, missing source records, unsafe
text, unsafe assets, invalid values, and incomplete profile readiness. The
named draft policy changes those diagnostics to non-blocking warnings while
retaining them in the result and placeholders in the document. Draft output
therefore remains visibly incomplete and requires an explicit caller opt-in.

### Public library API

| Export | Contract |
| --- | --- |
| `buildCapabilityStatement(profile, options?)` | Builds a deterministic, frozen AST plus all diagnostics and blocking diagnostics. |
| `assertCapabilityStatementExportable(result)` | Narrows an exportable result or throws `CapabilityStatementExportBlockedError`. |
| `DEFAULT_CAPABILITY_STATEMENT_POLICY` | Strict, all-blocking default. |
| `CAPABILITY_DIAGNOSTIC_HANDLING` | Stable `block` and `allow` policy values. |
| `TRANSLATION_UNAVAILABLE` | The explicit English/Arabic placeholder used when a source translation is absent. |
| `compileBilingualBusinessProfile(profile, quality?)` | Applies `strict` by default or the explicit permissive `draft` policy. |
| `renderBilingualBusinessProfileHTML(compilation)` | Requires an exportable compilation and renders a complete screen HTML document. |
| `generateBilingualBusinessProfilePDF(compilation)` | Requires an exportable compilation and renders a font-embedded PDF through the Phase 2 PDF engine. |
| `BILINGUAL_BUSINESS_PROFILE_DRAFT_POLICY` | Immutable all-allow policy used only for explicit draft exports. |

Capability diagnostic codes are `MISSING_TRANSLATION`, `MISSING_SOURCE`,
`UNSAFE_BIDI_CONTROL_REMOVED`, `UNSAFE_ASSET_OMITTED`,
`INVALID_SOURCE_VALUE`, and `PROFILE_NOT_READY`. Each diagnostic contains a
machine-readable source path, localized message, severity, and blocking flag.

### HTTP export API

`GET /api/business-profile/export` requires an authenticated session and the
session's tenant workspace.

Route-level exports are:

| Export | Contract |
| --- | --- |
| `resolveBusinessProfileExportFormat(value)` | Applies the exact HTML versus legacy-PDF fallback described below. |
| `resolveBusinessProfileExportLocale(value)` | Applies the bilingual, English, or legacy-Arabic resolution described below. |
| `resolveBusinessProfileExportQuality(value)` | Requires exact `draft`; every other value resolves to `strict`. |
| `handleBusinessProfileExport(request, dependencies?)` | Implements the route with an injectable dependency boundary for deterministic tests. |
| `GET(request)` | Next.js route entry point using production authentication, tenant, profile, renderer, and audit dependencies. |
| `BILINGUAL_CAPABILITY_EXPORT_BLOCKED_CODE` and `BILINGUAL_CAPABILITY_EXPORT_BLOCKED_MESSAGE` | Stable strict-gate response identifiers. |
| `BusinessProfileExportDependencies` | Typed seam for authentication, tenant lookup, profile loading, renderers, PDF generation, and audit recording. |

| Query | Accepted values | Resolution |
| --- | --- | --- |
| `format` | `html`, `pdf` | Exact `html` selects HTML; any other or missing value preserves the legacy PDF fallback. |
| `locale` | `ar`, `en`, `bilingual` | Exact `bilingual` selects the new engine, exact `en` selects legacy English, and any other or missing value preserves the legacy Arabic fallback. |
| `quality` | `strict`, `draft` | Applies only to bilingual output. Exact `draft` opts in to placeholders/warnings; any other or missing value is strict. |

| Outcome | Response |
| --- | --- |
| No session | `401` JSON without loading profile data |
| Strict bilingual diagnostics | `422` JSON with code `BILINGUAL_CAPABILITY_EXPORT_BLOCKED` and blocking diagnostics |
| Bilingual HTML success | `200 text/html`, inline bilingual capability-statement filename |
| Bilingual PDF success | `200 application/pdf`, attachment filename |
| PDF runtime failure | `503` JSON with code `PDF_UNAVAILABLE` |

Successful downloads emit the existing artifact-download audit event with
format, locale, and bilingual quality. A failed audit sink does not convert an
otherwise successful export into a failed response. Blocked and unauthorized
requests are not recorded as successful downloads.

### Example: strict library integration

```typescript
import {
  compileBilingualBusinessProfile,
  generateBilingualBusinessProfilePDF,
  renderBilingualBusinessProfileHTML,
  type BusinessProfileSnapshot,
} from "@/lib/business-profile";

export async function exportCapabilityStatement(
  profile: BusinessProfileSnapshot
) {
  const compilation = compileBilingualBusinessProfile(profile, "strict");
  if (!compilation.canExport) {
    return {
      ok: false as const,
      diagnostics: compilation.blockingDiagnostics,
    };
  }

  return {
    ok: true as const,
    html: renderBilingualBusinessProfileHTML(compilation),
    pdf: await generateBilingualBusinessProfilePDF(compilation),
  };
}
```

For an authenticated application request:

```text
GET /api/business-profile/export?format=html&locale=bilingual
GET /api/business-profile/export?format=pdf&locale=bilingual
GET /api/business-profile/export?format=html&locale=bilingual&quality=draft
```

The third request is an explicit draft opt-in. Do not use it as a substitute
for completing translations, source evidence, or readiness requirements.

## Safe Migration and Integration

1. Keep existing Arabic-only and English-only business-profile exports in
   place while adding `locale=bilingual`; the route already preserves those
   legacy branches.
2. Convert raw document inputs into the typed snapshot or definition for the
   target phase. Do not pass HTML through a string field.
3. Preserve independent Arabic and English source fields. Treat a missing
   translation as missing data, not permission to duplicate another language.
4. Register proposal sources first. For `APPROVED_KNOWLEDGE`, copy the exact
   server-resolved record type, content hash, evidence pointer, reviewer,
   approval time, provenance version/checksum, title, locator, and `asOf`
   binding. A bare or cross-tenant ID is rejected.
5. Run the target channel's validator before rendering. Surface diagnostic
   `code`, `path`, and localized message to the author.
6. Pin contract `template.key`, `versionId`, and `canonicalHash`, and proposal
   `snapshotVersion`, `snapshotHash`, `planHash`, and `presetKey` with stored
   artifacts.
7. Use preview/draft modes only for authoring. Require a clean binding or
   strict capability compilation at the final export boundary.
8. Keep legal approval as a separate, auditable workflow. The Phase 3
   persistence API contains no approval, publication, or execution writer.
9. Keep channel fallbacks explicit. Never drop a diagram, evidence block, or
   commercial entry merely because the selected writer cannot represent it.
10. Re-run targeted tests, type checking, lint, the full test suite, and build
    after wiring a new route or template consumer.

Phase 3 catalog-draft persistence requires the pending
`20260725003000_contract_draft_persistence` migration. It adds catalog
identity and request-id uniqueness, generation mode, diagnostic count, exact
serialized byte count, and a summary-pagination index. Its
compatibility-versioned checks force every new catalog-backed row to remain
canonical, bounded to 4 MiB, unreviewed, counsel-required, non-executable, and
draft-only.

Phase 4 persistence requires the pending
`20260724231500_proposal_structured_snapshot` migration. It adds the JSONB
snapshot, canonical hash, monotonic revision, preset, updater, and timestamp,
with database checks that require complete metadata. Final contract rendering
also requires pending migration
`20260725004000_contract_render_snapshot`, which adds the contract JSONB
snapshot, canonical hash, monotonic revision, integrity check, and tenant hash
index. These migrations have not been applied to the shared Neon database.
Review and apply all pending migrations through the controlled production
release process before deploying code that uses these fields; do not run
`prisma migrate` or `db push` as local setup.
Immutable knowledge evidence additionally requires the pending
`20260725001000_knowledge_evidence_integrity` migration, which binds reviewed
records to exact document-version checksums with restrictive foreign keys.

## Current Constraints

- Contract templates and rendered artifacts remain draft-only and unreviewed.
  Qualified Saudi counsel must review the completed terms and official sources
  before signature, execution, or representation as legally approved.
- Saved catalog drafts require the pending Phase 3 migration. Existing
  generation-schema version `0` contract rows remain legacy records and are
  not returned by the canonical draft API.
- The jurisdiction label in a template is not evidence of infrastructure,
  processing, or storage residency.
- Structured proposal HTML, PDF, and PPTX are wired to the authenticated active
  download route. Structured XLSX is not implemented, and legacy-only formats
  are blocked once an authoritative snapshot exists.
- PPTX diagrams are blocked. PPTX content uses referenced fonts, not embedded
  fonts, and supported tables are currently presented as bilingual text.
- Capability-statement HTTP export is implemented only on the existing
  authenticated business-profile route.
- Tests verify deterministic structure, validation, escaping, bidi behavior,
  accessibility markup, route status contracts, and representative PDF/PPTX
  file generation. They are not certification for the latest two versions of
  every browser or every PowerPoint-compatible application.
- PDF generation depends on a working Chromium runtime. The route reports a
  stable `503 PDF_UNAVAILABLE` response when that runtime fails.

## Verification

Install dependencies with Bun. Install Chromium once before live PDF tests:

```bash
bun install
bun run setup:pdf
```

Run the focused Phase 3–6 suite:

```bash
bun test \
  src/lib/__tests__/contract-templates.test.ts \
  src/lib/__tests__/contract-template-renderer.test.ts \
  src/lib/__tests__/contract-template-persistence.test.ts \
  src/lib/__tests__/contract-template-persistence-db.test.ts \
  src/lib/__tests__/contract-draft-route.test.ts \
  src/lib/__tests__/contract-draft-admission.test.ts \
  src/lib/__tests__/contract-template-catalog-ui.test.ts \
  src/lib/__tests__/contract-draft-migration.test.ts \
  src/lib/__tests__/proposal-layouts.test.ts \
  src/lib/__tests__/proposal-layout-export.test.ts \
  src/lib/__tests__/proposal-snapshot-persistence.test.ts \
  src/lib/__tests__/proposal-snapshot-evidence.test.ts \
  src/lib/__tests__/proposal-snapshot-route.test.ts \
  src/lib/__tests__/proposal-snapshot-hydration.test.ts \
  src/lib/__tests__/proposal-snapshot-identity.test.ts \
  src/lib/__tests__/proposal-submit-client.test.ts \
  src/lib/__tests__/proposal-edit-precondition.test.ts \
  src/lib/__tests__/proposal-final-export.test.ts \
  src/lib/__tests__/contract-render-snapshot.test.ts \
  src/lib/__tests__/contract-render-snapshot-migration.test.ts \
  src/lib/__tests__/proposal-download-format.test.ts \
  src/lib/__tests__/proposal-workflow-integrity.test.ts \
  src/lib/__tests__/document-visualizations.test.ts \
  src/lib/__tests__/capability-statement.test.ts \
  src/lib/__tests__/business-profile-bilingual.test.ts \
  src/lib/__tests__/business-profile-export-route.test.ts
```

Run the real Chromium contract-PDF test:

```bash
PLAYWRIGHT_CHROMIUM=1 bun test \
  src/lib/__tests__/contract-template-renderer.test.ts
```

Generate focused coverage and inspect the rows for the Phase 3–6 modules and
route; Bun's aggregate also includes transitively imported application code:

```bash
bun test --coverage \
  src/lib/__tests__/contract-templates.test.ts \
  src/lib/__tests__/contract-template-renderer.test.ts \
  src/lib/__tests__/contract-template-persistence.test.ts \
  src/lib/__tests__/contract-template-persistence-db.test.ts \
  src/lib/__tests__/contract-draft-route.test.ts \
  src/lib/__tests__/contract-draft-admission.test.ts \
  src/lib/__tests__/proposal-layouts.test.ts \
  src/lib/__tests__/document-visualizations.test.ts \
  src/lib/__tests__/capability-statement.test.ts \
  src/lib/__tests__/business-profile-bilingual.test.ts \
  src/lib/__tests__/business-profile-export-route.test.ts
```

The document-quality gate includes the pure Phase 4 snapshot, evidence,
identity, hydration, immutable review-binding, final-export, and contract
render-snapshot modules. The transactional `proposal-review-service.ts` remains
an integration boundary because it owns serializable Prisma mutations rather
than a pure policy API; the focused workflow tests assert that both HTTP and
agent decisions use that shared service, while the pure review-binding and
final-export policies are covered directly.

Run repository-wide static and build gates:

```bash
bunx tsc --noEmit
bun run lint
bun run test
bun run build
```

Do not run `bun run dev` and `bun run build` concurrently because both write to
`.next`.
