import { build, context } from "esbuild";

const isWatch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  format: "esm",
  target: "chrome116",
  sourcemap: false,
  minify: !isWatch,
  define: {
    "process.env.NODE_ENV": JSON.stringify(isWatch ? "development" : "production"),
  },
};

const entries = [
  {
    entryPoints: ["src/background/service-worker.ts"],
    outfile: "background/service-worker.js",
  },
  {
    entryPoints: ["src/content/bridge.ts"],
    outfile: "content/arabclue-bridge.js",
  },
  {
    entryPoints: ["src/content/etimad-parser.ts", "src/content/etimad-detail-parser.ts", "src/content/etimad-navigator.ts", "src/content/etimad-document-extractor.ts"],
    outdir: "content",
    outbase: "src/content",
  },
  {
    entryPoints: ["src/sidepanel/sidepanel.ts"],
    outfile: "sidepanel/sidepanel.js",
  },
  {
    entryPoints: ["src/shared/messages.ts"],
    outfile: "shared/messages.js",
  },
];

async function run() {
  if (isWatch) {
    for (const entry of entries) {
      const ctx = await context({ ...shared, ...entry });
      await ctx.watch();
    }
    console.log("[arabclue-agent] watching...");
  } else {
    for (const entry of entries) {
      await build({ ...shared, ...entry });
    }
    console.log("[arabclue-agent] built.");
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
