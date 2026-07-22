# Plan

1. ✅ **Scaffold AI SDK** — Install `ai`, `@ai-sdk/react`, provider packages; resolve model via AI Gateway or active tenant provider. _(Skill: ai-sdk)_
2. ✅ **Platform ToolLoopAgent** — Main agent with full-platform tools under tenant RBAC and product constitution. _(Skill: ai-sdk)_
3. ✅ **Chat API** — Authenticated streaming route using `createAgentUIStreamResponse`. _(Skill: ai-sdk)_
4. ✅ **Voice console UI** — Speak/listen, live tool-execution feed, dashboard navigation. _(Skill: ai-sdk)_
5. ✅ **Wire dashboard** — Nav entry, view registry, i18n, docs. _(Skill: executing-plans)_
6. ✅ **OpenAI Realtime + Gemini Live** — VOICE engine in admin, ephemeral token setup, `experimental_useRealtime` client. _(Skill: ai-sdk)_
   - Output: `src/lib/agents/platform/realtime.ts`
   - Output: `src/app/api/platform-agent/realtime/setup/route.ts`
   - Output: `src/app/api/platform-agent/realtime/tools/route.ts`
   - Output: `src/components/dashboard/live-voice-session.tsx`
7. ✅ **Verify & ship** — Tests, typecheck, commit, push, PR. _(Skill: executing-plans)_
