import { build, context } from "esbuild";

const isWatch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  target: "chrome116",
  sourcemap: false,
  minify: !isWatch,
  define: {
    "process.env.NODE_ENV": JSON.stringify(isWatch ? "development" : "production"),
  },
};

/** MV3 classic content scripts must be IIFE (not ESM). */
const contentIife = {
  ...shared,
  format: "iife",
};

/** Service worker + side panel can use ESM modules. */
const moduleEsm = {
  ...shared,
  format: "esm",
};

const entries = [
  {
    ...moduleEsm,
    entryPoints: ["src/background/service-worker.ts"],
    outfile: "background/service-worker.js",
  },
  {
    ...contentIife,
    entryPoints: ["src/content/bridge.ts"],
    outfile: "content/arabclue-bridge.js",
  },
  {
    ...contentIife,
    entryPoints: ["src/content/etimad-parser.ts"],
    outfile: "content/etimad-parser.js",
  },
  {
    ...contentIife,
    entryPoints: ["src/content/etimad-detail-parser.ts"],
    outfile: "content/etimad-detail-parser.js",
  },
  {
    ...contentIife,
    entryPoints: ["src/content/etimad-navigator.ts"],
    outfile: "content/etimad-navigator.js",
  },
  {
    ...contentIife,
    entryPoints: ["src/content/etimad-document-extractor.ts"],
    outfile: "content/etimad-document-extractor.js",
  },
  {
    ...contentIife,
    entryPoints: ["src/content/page-capture.ts"],
    outfile: "content/page-capture.js",
  },
  {
    ...moduleEsm,
    entryPoints: ["src/sidepanel/sidepanel.ts"],
    outfile: "sidepanel/sidepanel.js",
  },
  {
    ...moduleEsm,
    entryPoints: ["src/shared/messages.ts"],
    outfile: "shared/messages.js",
  },
];

async function run() {
  if (isWatch) {
    for (const entry of entries) {
      const ctx = await context(entry);
      await ctx.watch();
    }
    console.log("[arabclue-agent] watching...");
  } else {
    for (const entry of entries) {
      await build(entry);
    }
    console.log("[arabclue-agent] built.");
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
