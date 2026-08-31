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
  { en: "Run the agents", ar: "شغّل الوكلاء", tool: "startAgentPipeline" },
] as const);

export type MissionStarter = (typeof MISSION_STARTERS)[number];

/** The phrase to send, in the reader's language. */
export function starterCommand(
  starter: MissionStarter,
  locale: "ar" | "en"
): string {
  return locale === "ar" ? starter.ar : starter.en;
}
