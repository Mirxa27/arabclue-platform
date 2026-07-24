import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BROWSER_ENGINES = ["chromium", "firefox", "webkit"] as const;
const CHILD_TIMEOUT_MS = 75_000;
const TEST_FILE =
  "src/lib/__tests__/bilingual-browser-compatibility.test.ts";

function terminateProcessTree(child: ReturnType<typeof spawn>): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    child.kill("SIGKILL");
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

async function runEngine(
  engine: (typeof BROWSER_ENGINES)[number],
  repositoryRoot: string
): Promise<void> {
  process.stdout.write(`\n[browser-matrix] Running ${engine}\n`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["test", TEST_FILE, "--timeout=60000"],
      {
        cwd: repositoryRoot,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSER_ENGINE: engine,
          PLAYWRIGHT_BROWSER_MATRIX: "1",
        },
        stdio: "inherit",
      }
    );
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      terminateProcessTree(child);
      finish(
        new Error(
          `${engine} browser process exceeded ${String(CHILD_TIMEOUT_MS)}ms and was terminated.`
        )
      );
    }, CHILD_TIMEOUT_MS);
    child.once("error", (error) => finish(error));
    child.once("exit", (code, signal) => {
      terminateProcessTree(child);
      if (code === 0) {
        finish();
        return;
      }
      finish(
        new Error(
          `${engine} browser test failed${
            signal
              ? ` with signal ${signal}`
              : ` with exit code ${String(code)}`
          }.`
        )
      );
    });
  });
}

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
  const failures: Error[] = [];

  for (const engine of BROWSER_ENGINES) {
    try {
      await runEngine(engine, repositoryRoot);
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `${String(failures.length)} browser matrix engine(s) failed.`
    );
  }
  process.stdout.write("\n[browser-matrix] All three engines passed.\n");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`\n[browser-matrix] ${message}\n`);
    process.exitCode = 1;
  });
}
