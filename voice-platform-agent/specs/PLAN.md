# Plan

1. ✅ **Scaffold AI SDK** — Install `ai`, `@ai-sdk/react`, provider packages; resolve model via AI Gateway or active tenant provider. _(Skill: ai-sdk)_
   - Output: `package.json` dependencies (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`, `@ai-sdk/anthropic`)
   - Output: `src/lib/agents/platform/model.ts`
2. ✅ **Platform ToolLoopAgent** — Main agent with full-platform tools under tenant RBAC and product constitution. _(Skill: ai-sdk)_
   - Output: `src/lib/agents/platform/main-agent.ts`
   - Output: `src/lib/agents/platform/tools.ts`
   - Output: `src/lib/agents/platform/instructions.ts`
   - Output: `src/lib/agents/platform/context.ts`
3. ✅ **Chat API** — Authenticated streaming route using `createAgentUIStreamResponse`. _(Skill: ai-sdk)_
   - Output: `src/app/api/platform-agent/chat/route.ts`
4. ✅ **Voice console UI** — Speak/listen (Web Speech STT + TTS), live tool-execution feed, dashboard navigation. _(Skill: ai-sdk)_
   - Output: `src/components/dashboard/platform-agent-console.tsx`
5. ✅ **Wire dashboard** — Nav entry, view registry, i18n, docs. _(Skill: executing-plans)_
   - Output: `src/lib/store.ts`, `src/components/dashboard/views.tsx`, `src/components/dashboard/sidebar.tsx`, `src/lib/i18n.ts`, `docs/AI-SYSTEM.md`
6. ✅ **Verify & ship** — Tests, typecheck, commit, push, PR. _(Skill: executing-plans)_
   - Output: `src/lib/__tests__/platform-agent.test.ts`
