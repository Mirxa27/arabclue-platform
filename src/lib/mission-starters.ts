/**
 * First commands offered on the empty mission screen.
 *
 * The screen used to name examples in a sentence and leave the user to retype
 * one into a blank composer, which is the moment a plain-language interface
 * stops feeling like one. `tool` records the capability each phrase leans on so
 * a starter cannot outlive the tool that serves it.
 */
export const MISSION_STARTERS = Object.freeze([
  { en: "List my projects", ar: "اعرض مشاريعي", tool: "listProjects" },
  { en: "Create a tender", ar: "أنشئ مناقصة", tool: "createProject" },
  // The pipeline refuses to start until onboarding is complete
  // (assertOnboardingReady), so this starter is gated on the same flag.
  {
    en: "Run the agents",
    ar: "شغّل الوكلاء",
    tool: "startAgentPipeline",
    gate: "readyForProposals",
  },
] as const);

export type MissionStarter = (typeof MISSION_STARTERS)[number];

/** The phrase to send, in the reader's language. */
export function starterCommand(
  starter: MissionStarter,
  locale: "ar" | "en"
): string {
  return locale === "ar" ? starter.ar : starter.en;
}

/** What GET /api/onboarding already reports; the console passes it through. */
export type MissionReadiness = Readonly<{ readyForProposals: boolean }>;

export type ResolvedMissionStarter = Readonly<{
  /** The phrase sent to the agent when the button is pressed. */
  command: string;
  /** What the button shows; differs from `command` only when gated shut. */
  label: string;
  disabled: boolean;
}>;

const GATED_LABEL = Object.freeze({
  en: "Finish setup to run the agents",
  ar: "أكمل الإعداد لتشغيل الوكلاء",
});

/**
 * The starters as the empty screen should offer them. A starter whose gate is
 * closed stays visible — the capability exists — but is disabled and says what
 * unlocks it, instead of sending a command the pipeline will refuse. Unknown
 * readiness (still loading) leaves every starter enabled.
 */
export function resolveMissionStarters(
  locale: "ar" | "en",
  readiness: MissionReadiness | null | undefined
): readonly ResolvedMissionStarter[] {
  return MISSION_STARTERS.map((starter) => {
    const command = starterCommand(starter, locale);
    const gated =
      "gate" in starter &&
      starter.gate === "readyForProposals" &&
      readiness?.readyForProposals === false;
    return Object.freeze({
      command,
      label: gated ? GATED_LABEL[locale] : command,
      disabled: gated,
    });
  });
}
