import { EXECUTION_METHODOLOGY, VISION_2030_PILLARS } from "../constants";
import { retrieveRelevant, formatRagContext, type RagDocument } from "../rag";
import type { IngestionEntities, TechnicalArchitectOutput } from "../types";

export function runTechnicalArchitect(opts: {
  entities: IngestionEntities | null;
  pastProjects: RagDocument[];
  tenderCorpus?: RagDocument[];
  vision2030Alignment?: string | null;
  queryEmbedding?: number[] | null;
}): TechnicalArchitectOutput & {
  findings: string[];
  ragContext: string;
  tenderContext: string;
} {
  const query = [
    opts.entities?.scope ?? "",
    ...(opts.entities?.milestones.map((m) => m.name) ?? []),
  ].join(" ");

  const defaultQuery =
    query.trim() || "government digital transformation Saudi Arabia Etimad";

  const pastHits = retrieveRelevant(defaultQuery, opts.pastProjects, {
    topK: 5,
    queryEmbedding: opts.queryEmbedding,
  });

  const tenderHits = retrieveRelevant(
    defaultQuery,
    opts.tenderCorpus ?? [],
    {
      topK: 6,
      queryEmbedding: opts.queryEmbedding,
    }
  );

  const methodology = EXECUTION_METHODOLOGY.map((phase) => ({
    id: phase.id,
    name: phase.name,
    nameAr: phase.nameAr,
    rationale: `Aligns PMI (${phase.pmi}) with Agile (${phase.agile}) against tender SOW: ${(opts.entities?.scope ?? "").slice(0, 120)}`,
  }));

  const matchedProjects = pastHits.map((h) => ({
    id: h.id,
    title: h.title,
    score: h.score,
    why: `Relevance ${h.score.toFixed(3)} — ${h.summary.slice(0, 160)}`,
  }));

  const pillar =
    VISION_2030_PILLARS.find((p) => p.id === opts.vision2030Alignment) ??
    VISION_2030_PILLARS[1];

  const tenderSnippets = tenderHits
    .slice(0, 3)
    .map((h) => h.summary.slice(0, 200))
    .join(" | ");

  const solutionApproach = [
    "Solution architecture tailored to Etimad tender requirements with KSA-hosted cloud and Zero Trust controls.",
    opts.entities?.scope
      ? `Project understanding: ${opts.entities.scope.slice(0, 400)}`
      : "Project understanding derived from uploaded RFP package.",
    tenderSnippets
      ? `Tender corpus RAG: ${tenderSnippets}`
      : "Tender corpus RAG: no embedded chunks yet — using parsed entities only.",
    matchedProjects.length
      ? `Experience leverage: ${matchedProjects.map((p) => p.title).join("; ")}.`
      : "No sufficiently similar past projects ranked — methodology remains standards-based.",
  ].join("\n\n");

  const vision2030Notes = `Alignment with Vision 2030 pillar "${pillar.name}" / "${pillar.nameAr}"${
    opts.vision2030Alignment ? ` (brand configured: ${opts.vision2030Alignment})` : ""
  }. Claims are limited to Brand Setup alignment, tender corpus retrieval, and retrieved past-project outcomes.`;

  const findings = [
    `Retrieved ${pastHits.length} past project(s) via Brand RAG`,
    `Retrieved ${tenderHits.length} tender chunk(s) via document RAG`,
    ...matchedProjects.slice(0, 3).map((p) => `Match: ${p.title} (score ${p.score.toFixed(3)})`),
    vision2030Notes,
  ];

  const tenderContext = formatRagContext(tenderHits).replace(
    "No matching past projects found in Brand Setup corpus.",
    "No matching tender chunks found in uploaded documents."
  );

  return {
    methodology,
    matchedProjects,
    solutionApproach,
    vision2030Notes,
    findings,
    ragContext: formatRagContext(pastHits),
    tenderContext,
  };
}
