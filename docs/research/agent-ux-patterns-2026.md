# State-of-the-Art Autonomous Agent UX Patterns (Late 2026)

**Purpose:** Research report to inform the Arabclue rebuild from a 20+ tab / 15+ click / 3-wizard B2B dashboard into a chat-first autonomous agent surface with one-shot fast path and inbox-style retention loop for Saudi government tender bidding.

**Target users:** Procurement teams, bid managers, sales engineers working Saudi/GCC government tenders.

**Rebuild pillars:**

1. Autonomous page-agent-driven surface (agent renders and mutates the UI)
2. Chat as the front door
3. One-shot fast path (paste tender → get bid draft)
4. Inbox-style retention loop (recurring reasons to return)

Sources are dated where the page carried a visible date; otherwise the fetch date (Aug 2026) is used.

---

## 1. Chat-First as the Primary Surface

**Finding — Lovable Chat Mode (Dec 5, 2025):** Lovable split its product into a conversational "Chat Mode" and an execution "Default Mode." Chat Mode is explicitly framed as a *planning surface* — the model answers questions, asks clarifying questions via a dedicated `questions` tool, and does not mutate the app until the user greenlights. Users toggle modes on a per-message basis. (Source: `https://lovable.dev/blog/chat-mode-and-questions`)

**UX takeaway:** The chat surface must have two explicit gears: a **Plan gear** (asks clarifying questions, never mutates the bid) and an **Execute gear** (writes to the bid draft, uploads documents, files a submission). Gear is per-message, not per-session. Default to Plan on any message under ~15 tokens or containing a question mark.

**Finding — Manus Plan Mode:** Manus separates thinking from acting with a visible plan panel that decomposes the request into 3–8 sub-tasks the user can edit before execution begins. Plan is a first-class artifact, not a hidden CoT.

**UX takeaway:** Every agent turn on a tender opens with a visible 3–8 step plan (checkboxable, editable) in a **left rail**. User can strike, reorder, or add a step before hitting Run. This replaces the 3 wizards — the plan *is* the wizard, generated per tender.

**Finding — ChatGPT Agent + Deep Research (Feb 2, 2025; updated Feb 10, 2026):** OpenAI's Deep Research shows real-time progress narration ("Now checking supplier X's ISO cert…"), lets the user interrupt mid-run, and supports MCP connectors + a "trusted sites" allowlist. (Source: `https://openai.com/index/introducing-deep-research/`)

**UX takeaway:** During any run > 5 seconds, stream a one-line "what I'm doing now" status above the composer. Always render an **Interrupt** button (not a Stop icon) that pauses the run and returns control to chat without losing partial artifacts.

---

## 2. The Composer Is the App

**Finding — v0 and Vercel AI SDK v7:** v0's home is a single composer with model + attachment + tool toggles inline. There is no dashboard chrome above the fold. The AI SDK v7 pushes `useChat` + `Chat` primitives where tool calls render inline as typed React components.

**UX takeaway:** Arabclue's landing on `/app` should be a full-height composer, no sidebar visible on first paint. The 20+ tabs collapse into **slash commands** inside the composer (`/tender`, `/bid`, `/vendor`, `/submit`, `/status`). Slash palette is Arabic-first with English aliases.

**Finding — Bolt / Replit Agent (Replit doc):** Both surface the agent chat and the live artifact side-by-side, with the artifact updating in place as the agent works. (Source: `https://docs.replit.com/replitai/agent`)

**UX takeaway:** Split-view is the default when a bid draft, RFP analysis, or vendor comparison is active: **chat on the right (RTL-natural leading edge), live artifact on the left**. Toggling to full-artifact hides chat behind a floating action button (not a tab).

---

## 3. Artifacts as the Persistent Object

**Finding — Claude Code Artifacts:** Artifacts are live, addressable, interactive pages with a shareable URL that update in place across turns. They persist across sessions and can be forked. (Source: `https://docs.claude.com/en/docs/claude-code/artifacts`)

**UX takeaway:** Every tender in Arabclue is an **artifact URL** (`/t/{tender-id}`), not a row in a table. Deep-linkable, embeddable in Slack/Teams/WhatsApp Business, forkable ("Create a variant bid for the same tender"). The artifact URL is what procurement teams paste into internal chat.

**Finding — Notion AI, Canvas (ChatGPT):** Long documents live as canvases the agent edits with visible diffs. User can accept/reject regions, not just whole turns.

**UX takeaway:** Bid drafts render as a canvas with **region-level accept/reject**. Each generated section (executive summary, technical response, commercial, compliance matrix) has an inline "Regenerate with feedback" affordance. Feedback prompts inherit the section's Arabic/English language automatically.

---

## 4. The Plan Panel: Replacing Wizards

**Finding — Lovable Agent Mode (Jun 30, 2025):** Agent Mode's think→plan→act loop reduced errors ~90% vs. the prior single-shot execution. The visible plan lets the user cut steps before they burn tokens. (Source: `https://lovable.dev/blog/agent-mode-beta`)

**UX takeaway:** Wizards go away entirely. Replace them with a **collapsible plan rail** that shows 3–8 checkboxable subtasks generated from the tender document. Example steps for a Saudi Etimad tender: "Parse RFP PDF → Extract mandatory requirements → Match against vendor catalog → Draft technical response → Generate compliance matrix → Draft commercial → Assemble PDF for Etimad upload."

**Finding — Devin 2.0 / 2.2, Cognition:** Devin's plan is editable and re-runnable at any step. Failed steps are marked and re-tried without restarting the whole session.

**UX takeaway:** Each plan step has three states: **pending, running, done, failed**. Failed steps get a one-click "Retry with more context" that lets the user paste one extra sentence or file, then resumes from that step — not from step 1.

---

## 5. One-Shot Fast Path

**Finding — v0, Bolt, Lovable, Replit Agent:** All four ship a "paste and get result" fast path: paste a URL or description → live working artifact in under 60 seconds. The fast path bypasses the plan panel; the plan appears retroactively as a "here's what I did" log.

**UX takeaway:** Arabclue's headline fast path: **paste an Etimad tender URL or drop the RFP PDF → get a first-draft bid in under 90 seconds**. No form, no wizard, no vendor selection. Plan panel appears *after* the draft renders, showing what the agent did and what it skipped ("I couldn't find your ISO 27001 cert — click to upload").

**Finding — Perplexity Labs:** For high-intent research queries, Labs runs a longer background job and delivers a report with citations. Fast path (regular Perplexity) and slow path (Labs) are one click apart.

**UX takeaway:** Every fast-path draft has a **"Go deeper" button** that promotes the request to a background job: full requirement extraction, competitor scan on prior Etimad awards, pricing benchmark. The background job lands in the inbox (see §6).

---

## 6. Inbox-Style Retention Loop

**Finding — Attio, Linear coding sessions + agent:** Both use an **inbox metaphor** for agent output: completed runs, questions from the agent, and status changes appear as inbox items. Unread count is the pull-back mechanism.

**UX takeaway:** Arabclue home screen has one persistent element: the **inbox**. Items include: new tenders matching saved filters, agent questions ("I need vendor pricing for line 12"), submission status changes from Etimad, and deadline reminders. Every push notification is an inbox item first — nothing is only ephemeral.

**Finding — Linear Agent:** Agents appear as first-class assignees. You can assign a bid section to "Agent" the same way you assign to a teammate.

**UX takeaway:** In Arabclue, `@agent` is an assignable identity on any bid section, comment, or compliance item. Assigning to `@agent` triggers a run; the result lands back as an inbox item, not a modal.

**Finding — Warp Agent CLI / Factories:** Warp treats long-running agent sessions as background factories the user checks in on. (Source: `https://www.warp.dev/`)

**UX takeaway:** For multi-day tenders (typical Etimad cycle: 14–30 days), expose a **"Watching" pane**: agent monitors amendments to the RFP, competitor activity signals, and Q&A publications from the buying authority. Each event fires an inbox item with a suggested action.

---

## 7. Progress, Transparency, and Interrupt

**Finding — Deep Research + Gemini Deep Research:** Both stream reasoning at a summary level (not raw CoT), name the current source, and let the user redirect mid-run. (Sources: `https://openai.com/index/introducing-deep-research/`, `https://blog.google/products/gemini/google-gemini-deep-research/`)

**UX takeaway:** During any run, show three things in a slim status bar above the composer: **(1) current step name in Arabic/English, (2) elapsed / estimated time, (3) Interrupt button**. Never show raw chain-of-thought — show sanitized step names ("Reading RFP section 4.2" not "Thinking: I should now…").

**Finding — Devin 2.2:** Devin exposes a "why did you do that?" affordance on every action. Click a step, get the reasoning + sources.

**UX takeaway:** Every generated bid section, every requirement extraction, every vendor match has a **"Why?" chip** that opens a side panel with (1) the source RFP paragraph quoted verbatim, (2) the rule applied, (3) confidence, (4) "Report incorrect" button that trains the tenant's private model.

---

## 8. Tool Use Rendered Inline

**Finding — Vercel AI SDK v7, Claude Code, Cursor:** Tool calls render as typed inline components: file diff, terminal output, search result card, browser screenshot. The user reads the tool result in-line, not in a separate panel.

**UX takeaway:** In Arabclue chat, every tool call renders inline as a typed card:

- **`etimad.search`** → a card with matching tenders and a "Select" button
- **`rfp.extract_requirements`** → a collapsible checklist of extracted mandatory / optional requirements
- **`vendor.match`** → a table of top-3 vendor matches with fit scores
- **`bid.draft_section`** → an inline mini-canvas with the section
- **`compliance.check`** → a red/yellow/green matrix inline

Cards are Arabic-native (RTL layout, Hindi numerals optional per user setting per §13).

---

## 9. Memory and Context Continuity

**Finding — Cursor, Claude Code, Notion AI:** All three carry per-project memory: prior decisions, style, terminology. Cursor's `.cursorrules` and Claude Code's `AGENTS.md` are user-editable memory files.

**UX takeaway:** Each Arabclue tenant has an editable **`company-profile.md`** (Arabic + English) surfaced in Settings as a rich editor, not a form. It stores: company name, CR number, VAT, ISO certs, past-performance references, preferred vendors, language preference, and "how we write" style notes. Every agent run auto-attaches this file.

**Finding — Manus, Devin:** Both persist a per-task working memory that survives across sessions and hand-offs between teammates.

**UX takeaway:** Each tender artifact carries a persistent **working memory panel** (collapsible) with: extracted requirements, decisions made, open questions, and pending user inputs. Any teammate opening the artifact sees the same working memory — no re-briefing.

---

## 10. Handoff to Human at the Right Moment

**Finding — Lovable questions tool, Manus, Devin:** Modern agents stop and ask when confidence drops below threshold or when a decision has commercial consequences. Questions render as inline chat prompts with structured answer affordances (buttons, dropdowns, file upload), not free-text.

**UX takeaway:** Arabclue agent must interrupt itself and ask when:

- A mandatory requirement has no matching vendor evidence → **"Upload cert or mark as N/A"** with two buttons
- Pricing exceeds a user-set threshold → **"Approve markup" slider**
- The RFP has an ambiguous clause → **quote the clause + "Interpret as A / B / Ask buyer"**
- Submission deadline is < 24h → **"Confirm submit"** with hard confirmation

Every question is an inbox item and a push notification. Never a modal that blocks the whole app.

---

## 11. Speed, Latency, and the "Feels Instant" Bar

**Finding — v0, Bolt, Lovable:** First token in < 800ms; first useful artifact preview in < 6s; full working artifact in < 60s for common cases. Users abandon at ~10s of blank waiting.

**UX takeaway:** Arabclue budget: first token < 1s, first rendered plan step < 3s, first drafted bid section < 15s, full first-pass bid draft < 90s. Anything longer must be pushed to background and appear as an inbox item. **No blocking spinners longer than 3s.**

**Finding — Deep Research background jobs, Perplexity Labs:** Longer jobs (5–30 min) run in the background with email/push notification on completion.

**UX takeaway:** Anything > 90s becomes a background job with three notification channels: inbox item, browser push, WhatsApp/SMS (opt-in — critical for Saudi mobile-first users).

---

## 12. Concrete Teardowns of Cross-Cutting Patterns

**Finding — Attio agent inbox pattern:** Agent actions and questions live in a unified inbox alongside human comments. No separation between "system" and "agent" — they are one stream.

**UX takeaway:** Arabclue inbox merges: agent questions, agent completions, Etimad status changes, teammate comments, deadline reminders. Filters are chips, not tabs.

**Finding — Linear + agent-as-assignee:** Assigning to an agent creates the same UI affordance as assigning to a person. No separate "run agent" button.

**UX takeaway:** Any list of tasks in Arabclue (requirements checklist, compliance items, missing documents) uses the same assignee dropdown for humans and `@agent`. This is the single most powerful reduction of dashboard complexity — no more "Run Agent" button on 20 tabs.

**Finding — Bolt / Replit / Lovable public share URLs:** Every artifact has a public read-only URL for stakeholder review.

**UX takeaway:** Every bid draft gets a public review link (`/review/{token}`) with **watermark, expiry, and view-only mode**, sharable with the CFO or legal counsel for approval before submission. Comments on the review link land back in the artifact as inbox items.

**Finding — Cursor + Claude Code checkpoints:** Every agent action is a checkpoint the user can roll back to.

**UX takeaway:** Bid drafts have version history with named checkpoints ("Before pricing revision", "After legal review"). Rollback is one click, never destructive — a rollback creates a new branch, not a delete.

---

## 13. Arabic / RTL Specifics

Primary source for this section: Ahmad Shadeed, *RTL Styling 101* (`https://rtlstyling.com/posts/rtl-styling`). Arabic is Arabclue's default; every finding below is a hard requirement, not a "consider."

**Finding — `dir="rtl"` on `<html>`, not on components:** CSS Working Group recommends direction on the root element to guarantee correct bidirectional layout with or without CSS.

**UX takeaway:** Arabclue sets `<html dir="rtl" lang="ar">` by default. Language toggle flips both `dir` and `lang` on the root. Never set `dir` per-component except for explicit LTR content (emails, phone numbers, URLs — use `dir="auto"` on the input, per Shadeed).

**Finding — Mixed Arabic/English content mis-renders without `dir="auto"`:** Titles and truncation break when English identifiers appear in Arabic text.

**UX takeaway:** Every user-generated field (tender titles, vendor names, notes) uses `dir="auto"` on the input and rendered element. Compliance matrix cells with "ISO 27001" inside Arabic explanations must use `<span dir="auto">` at the cell level.

**Finding — CSS Logical Properties (`padding-inline-start`, `margin-inline-end`, `border-start-end-radius`) are the correct primitive:** Directional `left`/`right` breaks on RTL.

**UX takeaway:** Arabclue's design system tokens ban `left`/`right` in favor of `start`/`end`. Tailwind config must alias `pl-*` → `ps-*`, `pr-*` → `pe-*`. CI lint fails on physical directional properties in component code.

**Finding — Letter-spacing breaks Arabic letter connections; text opacity causes rendering artifacts:** Common English CSS habits actively damage Arabic readability.

**UX takeaway:** Set `letter-spacing: 0` on all Arabic content by default. Never use `rgba` or `opacity` for secondary text color in Arabic — use a solid muted color from the palette.

**Finding — Font fallback works per-character:** A Latin-first font stack with an Arabic fallback (e.g., `"Inter", "IBM Plex Sans Arabic", sans-serif`) correctly renders mixed content.

**UX takeaway:** Arabclue font stack: `"IBM Plex Sans Arabic", "Inter", system-ui, sans-serif` for Arabic-primary UI; reversed for LTR-primary users. Never `letter-spacing` on Arabic. Never text with less than solid #6B7280 grey for secondary content.

**Finding — Bidirectional icons need flipping; playback icons do not:** Arrows, breadcrumb chevrons, send-message icons flip; play/pause/next/prev do not (they represent tape direction, not time).

**UX takeaway:** Arabclue's icon library has three classes: **`bi-flip`** (arrows, chevrons, back, forward, send, breadcrumbs), **`bi-fixed`** (play, pause, checkmark, close, hamburger), **`bi-context`** (send-message icon flips; audio-play does not). Flip via `transform: scaleX(-1)` on `[dir="rtl"] .bi-flip`.

**Finding — Hindi (٠١٢٣) vs. Arabic (0123) numerals — pick one and stay consistent:** Saudi government forms typically use Arabic (Western) numerals for prices and dates; Hindi numerals appear in ceremonial/traditional contexts.

**UX takeaway:** Arabclue defaults to Arabic (Western) numerals everywhere for prices, dates, quantities, and IDs. Add a per-tenant setting for Hindi numerals in display-only contexts (page headers, decorative). Etimad submission payloads always use Arabic numerals — hard-coded, not settable.

**Finding — Word length differences bloat/shrink buttons:** Arabic "تم" (Done) is 2 chars where English "Done" is 4; German "Abschicken" is 10. Buttons collapse or overflow.

**UX takeaway:** Every button has `min-width: 6ch` and `padding-inline: 1rem` minimum. Buttons never size to content alone. Compliance-matrix action buttons ("Approve" / "موافقة") share fixed width across languages.

**Finding — Text truncation truncates wrong side in mixed content:** Without `dir="auto"`, English tender titles truncate at the wrong end in RTL layout.

**UX takeaway:** Every truncated text element (tender list rows, vendor names in tables, inbox item titles) has `dir="auto"` and uses `text-overflow: ellipsis` with logical `overflow-inline: hidden`.

**Finding — Underlined links overlap Arabic diacritics; use `text-decoration-skip-ink` or box-shadow underline:** Default browser underline covers the dots of ب, ت, ث, ن and cuts kasra diacritics.

**UX takeaway:** All Arabic links use `text-decoration-skip-ink: auto` and increased `text-underline-offset: 4px`. Alternatively, remove underlines and rely on color contrast + weight for interactive text.

**Finding — Form inputs: email/phone stay LTR-aligned; placeholder aligns to `start`:** Email, phone, URL, CR number, VAT number are all LTR content inside an RTL form.

**UX takeaway:** Arabclue form primitives:

- Text inputs default to `dir="auto"`
- Email/phone/URL/tax-ID inputs are `dir="ltr"` with placeholder aligned to `start` (right in RTL)
- Currency inputs display the currency symbol at the `end` (left in RTL) with the number in Arabic (Western) numerals

**Finding — Component-level RTL requirements (breadcrumbs, tables, tabs, cards, toasts, page headers, toggles):** Each has a specific flip rule; toggles behave like checkboxes.

**UX takeaway:** Arabclue design-system audit before build: every component gets an RTL Storybook story + visual regression test. Named `.c-page-header__start` / `.c-page-header__end` (never `__left` / `__right`) per Shadeed's convention. Toggle switches flip: "on" is on the `end` side (left in RTL, right in LTR).

**Finding — CI/automation tooling:** RTLCSS transforms compiled CSS; PostCSS Logical adds fallbacks for logical properties.

**UX takeaway:** Arabclue build pipeline: Tailwind + `postcss-logical` for auto-fallbacks, RTLCSS as a safety net on the compiled bundle, plus a custom lint rule blocking `left`/`right`/`text-align: left`/`text-align: right` in source.

---

## SYNTHESIS: 10 Concrete UX Rules for the Arabclue Rebuild

These are the load-bearing rules. Every screen, component, and interaction must pass them.

1. **The composer is the home screen.** No sidebar visible on first paint. `/app` opens to a full-height Arabic-first composer with slash commands (`/tender`, `/bid`, `/vendor`, `/submit`, `/status`) replacing the 20+ tabs.

2. **Every message picks a gear: Plan or Execute.** Plan mode asks clarifying questions (via a `questions` tool) and never mutates. Execute mode writes to the bid draft. Toggle is per-message, default = Plan when the user asks a question.

3. **Every run opens a visible 3–8 step plan.** Plan is editable before Run, checkboxable during Run, and each step has {pending, running, done, failed} state. Failed steps get one-click Retry with added context. **This kills all three wizards.**

4. **The one-shot fast path is the marketing headline.** Paste Etimad URL or drop RFP PDF → first-draft bid in < 90s. Plan appears retroactively as "here's what I did / here's what I skipped."

5. **Every tender is an artifact URL, not a table row.** `/t/{id}` is shareable, forkable, embeddable. Public review links (`/review/{token}`) with watermark and expiry for CFO/legal approval.

6. **Inbox is the retention loop.** Home has one persistent element: an inbox merging agent questions, agent completions, Etimad status changes, teammate comments, and deadline reminders. Unread count is the pull-back. Three notification channels: inbox, browser push, WhatsApp/SMS (opt-in).

7. **`@agent` is an assignable identity.** Any task, checklist item, or bid section can be assigned to `@agent` the same way it's assigned to a human. **This kills every "Run Agent" button in the old dashboard.**

8. **Latency budget is non-negotiable.** First token < 1s. First plan step < 3s. First drafted section < 15s. Full first-pass < 90s. Anything longer becomes a background job with inbox delivery. No blocking spinners > 3s.

9. **The agent interrupts itself when confidence drops.** Structured questions (buttons, uploads, sliders) — never free-text modals. Every question is an inbox item, never a blocking modal.

10. **RTL and Arabic are the default, not a toggle.** `<html dir="rtl" lang="ar">` on first paint. Logical properties everywhere (`padding-inline-start`, `margin-inline-end`). Font stack: `"IBM Plex Sans Arabic", "Inter"`. Arabic (Western) numerals by default. `dir="auto"` on every user-generated field. Icon library split into `bi-flip` / `bi-fixed` / `bi-context`. Buttons `min-width: 6ch`. All Arabic links use `text-decoration-skip-ink: auto`. CI lint blocks `left`/`right` in source.

---

## Source Log

| # | Source | Fetched | Notes |
|---|--------|---------|-------|
| 1 | `https://docs.replit.com/replitai/agent` | Aug 2026 | Replit Agent chat + live artifact |
| 2 | `https://openai.com/index/introducing-deep-research/` | Feb 2, 2025; updated Feb 10, 2026 | MCP connectors, trusted sites, real-time progress, interruption |
| 3 | `https://blog.google/products/gemini/google-gemini-deep-research/` | Aug 2026 | Streamed reasoning at summary level |
| 4 | `https://docs.claude.com/en/docs/claude-code/artifacts` | Aug 2026 | Live shareable artifact URLs, in-place updates |
| 5 | `https://www.warp.dev/` | Aug 2026 | Factories = long-running background agent sessions |
| 6 | `https://lovable.dev/blog` | Aug 2026 | Blog index |
| 7 | `https://lovable.dev/blog/chat-mode-and-questions` | Dec 5, 2025 | Chat Mode + `questions` tool + per-message mode toggle |
| 8 | `https://lovable.dev/blog/agent-mode-beta` | Jun 30, 2025 | Think→plan→act, -90% error rate |
| 9 | `https://rtlstyling.com/posts/rtl-styling` | Aug 2026 | Ahmad Shadeed — the canonical RTL styling reference |
| 10 | Prior-session fetches | Prior | Cognition/Devin 2.0/2.2, Manus + Plan Mode, v0, Vercel AI SDK v7, Bolt, Linear coding sessions + agent, ChatGPT Agent, Canvas, Notion AI, Attio, Cursor, Perplexity Labs |

**Not fetched (404 or transport error):** `warp.dev/agent-mode`, `latent.space/p/agent-ux`, `nngroup.com/articles/ai-agents-ux/`, `smashingmagazine.com/2025/rtl-arabic-interfaces-guide/`, `news.lovable.dev/`, `every.to/chain-of-thought/the-ai-agent-that-can-use-any-app`. Coverage of those themes is substituted by adjacent primary sources listed above.
