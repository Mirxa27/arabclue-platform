import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mock } from "bun:test";

type AutonomyFlagsModule = typeof import("../autonomy-flags");
let getAutonomyFlags: AutonomyFlagsModule["getAutonomyFlags"];
let isAutonomyShellEnabled: AutonomyFlagsModule["isAutonomyShellEnabled"];
let isAutonomyRealAiOnly: AutonomyFlagsModule["isAutonomyRealAiOnly"];
let getAutonomyFlagsFromProcessEnv: AutonomyFlagsModule["getAutonomyFlagsFromProcessEnv"];
let __internal: AutonomyFlagsModule["__internal"];

// Backing store for the mocked EnvSetting rows. Each test resets this map.
const envSettingStore = new Map<string, string>();

beforeAll(async () => {
  mock.module("../db", () => ({
    db: {
      envSetting: {
        findUnique: mock(({ where }: { where: { key: string } }) => {
          const value = envSettingStore.get(where.key);
          if (value == null) return Promise.resolve(null);
          // decryptValue mock below strips the "dec:" prefix
          return Promise.resolve({ valueEncrypted: `dec:${value}` });
        }),
      },
    },
  }));

  mock.module("../crypto", () => ({
    decryptValue: mock((ciphertext: string) => {
      if (ciphertext.startsWith("dec:")) return ciphertext.slice(4);
      return "";
    }),
    encryptValue: mock((plain: string) => `enc:${plain}`),
    assertProductionSecrets: mock(() => {}),
    maskSecret: mock(() => "••••"),
    rotateEncryption: mock((c: string) => c),
  }));

  mock.module("../llm/model-catalog", () => ({
    defaultApiKeyEnvKey: mock(() => ""),
    isAllowedProviderApiKeyEnv: mock(() => false),
  }));

  ({
    getAutonomyFlags,
    isAutonomyShellEnabled,
    isAutonomyRealAiOnly,
    getAutonomyFlagsFromProcessEnv,
    __internal,
  } = await import("../autonomy-flags"));
});

beforeEach(() => {
  envSettingStore.clear();
  delete process.env.AUTONOMY_SHELL;
  delete process.env.AUTONOMY_REAL_AI_ONLY;
});

describe("normalizeFlag", () => {
  test("treats '1', 'true', 'on', 'yes' as ON, case-insensitively", () => {
    for (const v of ["1", "true", "TRUE", "True", "on", "ON", "yes", "YES"]) {
      expect(__internal.normalizeFlag(v)).toBe(true);
    }
  });

  test("treats everything else as OFF (including empty, whitespace, '0', 'false', null, undefined)", () => {
    for (const v of ["", " ", "0", "false", "off", "no", "maybe", "enable"]) {
      expect(__internal.normalizeFlag(v)).toBe(false);
    }
    expect(__internal.normalizeFlag(null)).toBe(false);
    expect(__internal.normalizeFlag(undefined)).toBe(false);
  });

  test("trims surrounding whitespace before checking", () => {
    expect(__internal.normalizeFlag("  true  ")).toBe(true);
    expect(__internal.normalizeFlag("\t1\n")).toBe(true);
  });
});

describe("isAutonomyShellEnabled", () => {
  test("returns false when neither process.env nor EnvSetting is set", async () => {
    expect(await isAutonomyShellEnabled()).toBe(false);
  });

  test("process.env AUTONOMY_SHELL=1 turns it ON", async () => {
    process.env.AUTONOMY_SHELL = "1";
    expect(await isAutonomyShellEnabled()).toBe(true);
  });

  test("process.env value wins over EnvSetting", async () => {
    process.env.AUTONOMY_SHELL = "0";
    envSettingStore.set("AUTONOMY_SHELL", "1");
    expect(await isAutonomyShellEnabled()).toBe(false);
  });

  test("EnvSetting row turns it ON when process.env is unset", async () => {
    envSettingStore.set("AUTONOMY_SHELL", "true");
    expect(await isAutonomyShellEnabled()).toBe(true);
  });

  test("process.env explicit empty string is treated as OFF, not as fall-through to EnvSetting", async () => {
    // This is the important guarantee: an operator who deliberately sets
    // AUTONOMY_SHELL="" in the deploy env must be able to force-disable
    // even if an admin toggled the EnvSetting row ON.
    process.env.AUTONOMY_SHELL = "";
    envSettingStore.set("AUTONOMY_SHELL", "1");
    expect(await isAutonomyShellEnabled()).toBe(false);
  });
});

describe("isAutonomyRealAiOnly", () => {
  test("defaults to OFF", async () => {
    expect(await isAutonomyRealAiOnly()).toBe(false);
  });

  test("independent from AUTONOMY_SHELL", async () => {
    process.env.AUTONOMY_SHELL = "1";
    process.env.AUTONOMY_REAL_AI_ONLY = "0";
    expect(await isAutonomyRealAiOnly()).toBe(false);

    process.env.AUTONOMY_SHELL = "0";
    process.env.AUTONOMY_REAL_AI_ONLY = "yes";
    expect(await isAutonomyRealAiOnly()).toBe(true);
  });

  test("EnvSetting can flip it without a redeploy", async () => {
    envSettingStore.set("AUTONOMY_REAL_AI_ONLY", "on");
    expect(await isAutonomyRealAiOnly()).toBe(true);
  });
});

describe("getAutonomyFlags", () => {
  test("returns both flags in a single object", async () => {
    process.env.AUTONOMY_SHELL = "1";
    process.env.AUTONOMY_REAL_AI_ONLY = "0";
    const flags = await getAutonomyFlags();
    expect(flags).toEqual({ shell: true, realAiOnly: false });
  });

  test("returns both false by default", async () => {
    const flags = await getAutonomyFlags();
    expect(flags).toEqual({ shell: false, realAiOnly: false });
  });
});

describe("getAutonomyFlagsFromProcessEnv", () => {
  test("ignores EnvSetting even when set — process.env only", () => {
    envSettingStore.set("AUTONOMY_SHELL", "1");
    envSettingStore.set("AUTONOMY_REAL_AI_ONLY", "1");
    const flags = getAutonomyFlagsFromProcessEnv();
    expect(flags).toEqual({ shell: false, realAiOnly: false });
  });

  test("reads process.env when set", () => {
    process.env.AUTONOMY_SHELL = "true";
    process.env.AUTONOMY_REAL_AI_ONLY = "yes";
    const flags = getAutonomyFlagsFromProcessEnv();
    expect(flags).toEqual({ shell: true, realAiOnly: true });
  });
});
