### Task 5 Report: Mission Control speech/mission error recovery

Status: DONE

Commit: `fix(mission): toast speech gaps and mission create recovery`

Changes:
- Replaced the unsupported `SpeechRecognition` browser `alert()` with a localized destructive toast.
- Added mission bootstrap error state with a visible localized Retry button that re-runs `POST /api/platform-agent/missions`.
- Updated classic Mission Control Stop actions to abort recognition, cancel `speechSynthesis`, call chat `stop()`, and show a concise localized stopped toast.

Tests:
- `rg "alert\\(" /workspace/src/components/dashboard --glob "*.tsx"`: no matches.
- `bunx tsc --noEmit`: pass.

Concerns:
- GUI automation is not available in this subagent tool set, so verification is terminal-based.
