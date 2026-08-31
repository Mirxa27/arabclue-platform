import { describe, expect, test } from "bun:test";
import { assertProviderCredentialOrigin } from "@/lib/llm/model-catalog";

/**
 * Security contract: a resolved provider credential may only be sent to the
 * vendor that credential belongs to.
 *
 * Historical hole: POST /api/admin/ai-providers/models with
 * `{ provider: "openai", apiBase: "https://attacker.example" }` auto-resolved
 * the platform's real OPENAI_API_KEY and sent it as a Bearer token to the
 * attacker host (SSRF + credential exfiltration, ADMIN-role gated only).
 */

const ok = (apiBase: string | null, apiKeyEnvKey: string | null) =>
  expect(() =>
    assertProviderCredentialOrigin({ apiBase, apiKeyEnvKey })
  ).not.toThrow();

const blocked = (apiBase: string | null, apiKeyEnvKey: string | null) =>
  expect(() =>
    assertProviderCredentialOrigin({ apiBase, apiKeyEnvKey })
  ).toThrow();

describe("assertProviderCredentialOrigin", () => {
  test("canonical platform keys only flow to their vendor origin", () => {
    ok("https://api.openai.com/v1", "OPENAI_API_KEY");
    ok("https://api.anthropic.com", "ANTHROPIC_API_KEY");
    ok("https://api.groq.com/openai/v1", "GROQ_API_KEY");
    ok("https://generativelanguage.googleapis.com/v1beta", "GEMINI_API_KEY");
    ok("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY");
    ok("https://api.deepseek.com/v1", "DEEPSEEK_API_KEY");
  });

  test("canonical platform keys are refused for any other origin", () => {
    blocked("https://attacker.example", "OPENAI_API_KEY");
    blocked("https://attacker.example/v1", "ANTHROPIC_API_KEY");
    blocked("https://api.openai.com.evil.example/v1", "OPENAI_API_KEY");
    blocked("http://api.openai.com/v1", "OPENAI_API_KEY"); // https only
    blocked("https://attacker.example", "GROQ_API_KEY");
  });

  test("azure key binds to *.openai.azure.com", () => {
    ok("https://mytenant.openai.azure.com/openai", "AZURE_OPENAI_API_KEY");
    blocked("https://attacker.example", "AZURE_OPENAI_API_KEY");
    blocked("https://fakeopenai.azure.com.evil.example", "AZURE_OPENAI_API_KEY");
  });

  test("suffixed operator credentials allow public HTTPS hosts only", () => {
    ok("https://gateway.mycompany.example/v1", "OPENAI_API_KEY_TEAM_B");
    blocked("http://gateway.mycompany.example/v1", "OPENAI_API_KEY_TEAM_B");
    blocked("https://localhost:8080/v1", "OPENAI_API_KEY_TEAM_B");
    blocked("https://127.0.0.1/v1", "OPENAI_API_KEY_TEAM_B");
    blocked("https://10.0.0.5/v1", "OPENAI_API_KEY_TEAM_B");
    blocked("https://172.20.1.1/v1", "OPENAI_API_KEY_TEAM_B");
    blocked("https://192.168.1.10/v1", "OPENAI_API_KEY_TEAM_B");
    blocked("https://169.254.169.254/latest", "OPENAI_API_KEY_TEAM_B");
    blocked("https://internal.local/v1", "OPENAI_API_KEY_TEAM_B");
  });

  test("zai key has no repo-canonical origin: public HTTPS rule applies", () => {
    ok("https://api.z.ai/api/paas/v4", "ZAI_API_KEY");
    blocked("https://192.168.0.2/v1", "ZAI_API_KEY");
    blocked("http://api.z.ai/api/paas/v4", "ZAI_API_KEY");
  });

  test("keyless and default-base calls are unaffected", () => {
    ok(null, "OPENAI_API_KEY"); // no custom base → canonical default is used
    ok("", "OPENAI_API_KEY");
    ok("http://127.0.0.1:11434/v1", null); // ollama-style keyless local
    ok("http://127.0.0.1:11434/v1", "");
  });

  test("unparseable base with a key is refused", () => {
    blocked("not a url", "OPENAI_API_KEY");
    blocked("ftp://api.openai.com", "OPENAI_API_KEY");
  });
});
