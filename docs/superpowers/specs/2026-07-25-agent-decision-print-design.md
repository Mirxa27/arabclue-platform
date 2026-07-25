# Agent transparency, reliability, and print-ready exports

## Frontend
- Honest Mission Control forge: no synthetic progress %; failed tools show `errorText`.
- Agent run poll recovers after transient errors (reschedule + toast).
- Dashboard StatCards throw on `!res.ok` and offer Retry.

## Backend
- Thresholds centralized in `AGENT_CONFIG` (coverage scores, autopilot confidence, tool-loop limits).
- `coverage.ts`, `classify-attachment.ts`, and `main-agent.ts` read config — no divergent magic numbers.
- Decision catalog remains `agent-registry.ts`; human map in `docs/AGENT_DECISION_LOGIC.md`.

## Security
- Pricing population stays forced off (`verifySafetyInvariants`).
- Validation gates continue to block pricing language, missing disclaimers, false legal certainty.
- PDF/HTML export still tenant-scoped via existing auth on download routes (unchanged).
- No secrets in docs or agent prompts.

## Print
- Margin safety aligned to 18mm / 14mm; print CSS orphans/widows + avoid-break; RGB documented (CMYK = prepress).
