import { beforeAll, describe, expect, test } from "bun:test";
import { mock } from "bun:test";

type EnvSettingsModule = typeof import("../env-settings");
let getDecryptedEnv: EnvSettingsModule["getDecryptedEnv"];
let getProviderApiKey: EnvSettingsModule["getProviderApiKey"];
let resolveProviderApiKey: EnvSettingsModule["resolveProviderApiKey"];

beforeAll(async () => {
// Mock the db module to avoid hitting the real database
mock.module("../db", () => ({
  db: {
    envSetting: {
      findUnique: mock(() => Promise.resolve(null)),
    },
  },
}));

// Mock the crypto module to avoid needing ARABCLUE_ENC_KEY
mock.module("../crypto", () => ({
  decryptValue: mock((ciphertext: string) => {
    // Simple reversible mock: prefix "dec:" means decrypted value
    if (ciphertext.startsWith("dec:")) return ciphertext.slice(4);
    return "";
  }),
  encryptValue: mock((plain: string) => `enc:${plain}`),
  assertProductionSecrets: mock(() => {}),
  maskSecret: mock((v: string) => "••••"),
  rotateEncryption: mock((c: string) => c),
}));

// Mock model-catalog to control defaultApiKeyEnvKey
mock.module("../llm/model-catalog", () => ({
  defaultApiKeyEnvKey: mock((provider: string) => {
    switch (provider) {
      case "openai":
        return "OPENAI_API_KEY";
      case "google":
        return "GOOGLE_GENERATIVE_AI_API_KEY";
      default:
        return "";
    }
  }),
}));

({ getDecryptedEnv, getProviderApiKey, resolveProviderApiKey } =
  await import("../env-settings"));
});

describe("getDecryptedEnv", () => {
  test("returns process.env value when present", async () => {
    const prev = process.env.TEST_ENV_KEY;
    process.env.TEST_ENV_KEY = "from-process-env";
    try {
      const val = await getDecryptedEnv("TEST_ENV_KEY");
      expect(val).toBe("from-process-env");
    } finally {
      if (prev === undefined) delete process.env.TEST_ENV_KEY;
      else process.env.TEST_ENV_KEY = prev;
    }
  });

  test("returns empty string when key is not in env or db", async () => {
    const prev = process.env.NONEXISTENT_KEY_123;
    delete process.env.NONEXISTENT_KEY_123;
    try {
      const val = await getDecryptedEnv("NONEXISTENT_KEY_123");
      expect(val).toBe("");
    } finally {
      if (prev !== undefined) process.env.NONEXISTENT_KEY_123 = prev;
    }
  });
});

describe("getProviderApiKey", () => {
  test("returns empty for unknown provider", async () => {
    const val = await getProviderApiKey("unknown_provider");
    expect(val).toBe("");
  });

  test("returns process.env value for openai", async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-key";
    try {
      const val = await getProviderApiKey("openai");
      expect(val).toBe("sk-test-key");
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });

  test("checks Google alternate env names", async () => {
    const prevGoogle = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const prevAlt = process.env.GOOGLE_API_KEY;
    const prevAlt2 = process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    process.env.GEMINI_API_KEY = "gemini-key";
    try {
      const val = await getProviderApiKey("google");
      expect(val).toBe("gemini-key");
    } finally {
      if (prevGoogle === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      else process.env.GOOGLE_GENERATIVE_AI_API_KEY = prevGoogle;
      if (prevAlt === undefined) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = prevAlt;
      if (prevAlt2 === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevAlt2;
    }
  });
});

describe("resolveProviderApiKey", () => {
  // A custom key must name a provider credential slot. The multi-account suffix
  // form is the supported case: one deployment holding several credentials for
  // the same vendor.
  test("uses a custom env key inside the provider-credential allowlist", async () => {
    const prev = process.env.OPENAI_API_KEY_TEAM_B;
    process.env.OPENAI_API_KEY_TEAM_B = "custom-key-value";
    try {
      const val = await resolveProviderApiKey(
        "openai",
        "OPENAI_API_KEY_TEAM_B"
      );
      expect(val).toBe("custom-key-value");
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY_TEAM_B;
      else process.env.OPENAI_API_KEY_TEAM_B = prev;
    }
  });

  // Regression: an administrator-supplied name outside the allowlist previously
  // read any variable in the process and forwarded it to the connection's
  // apiBase as a bearer token.
  test("ignores a custom env key outside the allowlist and uses the provider default", async () => {
    const prevSecret = process.env.NEXTAUTH_SECRET;
    const prevDefault = process.env.OPENAI_API_KEY;
    process.env.NEXTAUTH_SECRET = "super-secret-session-signing-key";
    process.env.OPENAI_API_KEY = "default-openai-key";
    try {
      const val = await resolveProviderApiKey("openai", "NEXTAUTH_SECRET");
      expect(val).toBe("default-openai-key");
      expect(val).not.toBe("super-secret-session-signing-key");
    } finally {
      if (prevSecret === undefined) delete process.env.NEXTAUTH_SECRET;
      else process.env.NEXTAUTH_SECRET = prevSecret;
      if (prevDefault === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prevDefault;
    }
  });

  test.each(["DATABASE_URL", "ARABCLUE_ENC_KEY", "MYFATOORAH_API_KEY"])(
    "never resolves the platform secret %s through a provider connection",
    async (secretName) => {
      const prevSecret = process.env[secretName];
      const prevDefault = process.env.OPENAI_API_KEY;
      process.env[secretName] = `value-of-${secretName}`;
      process.env.OPENAI_API_KEY = "default-openai-key";
      try {
        const val = await resolveProviderApiKey("openai", secretName);
        expect(val).not.toBe(`value-of-${secretName}`);
      } finally {
        if (prevSecret === undefined) delete process.env[secretName];
        else process.env[secretName] = prevSecret;
        if (prevDefault === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = prevDefault;
      }
    }
  );

  test("falls back to provider default when custom key is empty", async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "default-openai-key";
    try {
      const val = await resolveProviderApiKey("openai", null);
      expect(val).toBe("default-openai-key");
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });

  test("falls back to provider default when custom key not set", async () => {
    const prev = process.env.OPENAI_API_KEY;
    const prevCustom = process.env.MISSING_CUSTOM_KEY;
    delete process.env.MISSING_CUSTOM_KEY;
    process.env.OPENAI_API_KEY = "fallback-key";
    try {
      const val = await resolveProviderApiKey("openai", "MISSING_CUSTOM_KEY");
      expect(val).toBe("fallback-key");
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
      if (prevCustom !== undefined) process.env.MISSING_CUSTOM_KEY = prevCustom;
    }
  });

  test("trims custom env key before lookup", async () => {
    const prev = process.env.OPENAI_API_KEY_TRIMMED;
    process.env.OPENAI_API_KEY_TRIMMED = "trimmed-value";
    try {
      const val = await resolveProviderApiKey(
        "openai",
        "  OPENAI_API_KEY_TRIMMED  "
      );
      expect(val).toBe("trimmed-value");
    } finally {
      if (prev === undefined) delete process.env.OPENAI_API_KEY_TRIMMED;
      else process.env.OPENAI_API_KEY_TRIMMED = prev;
    }
  });
});
