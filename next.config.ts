import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  reactStrictMode: true,
  // Enable for self-host `bun run build:standalone` / Docker. Harmless on Vercel.
  ...(process.env.STANDALONE === "1" || process.env.STANDALONE === "true"
    ? { output: "standalone" as const }
    : {}),
  // Keep Chromium/Playwright out of the webpack/turbopack bundle — load at runtime.
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "@sparticuz/chromium",
  ],
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Bundle the Chrome extension source with the serverless functions that
  // read it from disk (install metadata + on-the-fly ZIP packing).
  outputFileTracingIncludes: {
    "/api/platform-agent/extension": ["./extensions/arabclue-agent/**/*"],
    "/api/platform-agent/extension/download": [
      "./extensions/arabclue-agent/**/*",
    ],
    "/api/proposals/[id]/download": [
      "./node_modules/@fontsource/noto-sans/files/*.woff2",
      "./node_modules/@fontsource/noto-sans-arabic/files/*.woff2",
      "./node_modules/@ibm/plex-sans/fonts/complete/woff2/*.woff2",
      "./node_modules/@ibm/plex-sans-arabic/fonts/complete/woff2/*.woff2",
    ],
    "/api/business-profile/export": [
      "./node_modules/@fontsource/noto-sans/files/*.woff2",
      "./node_modules/@fontsource/noto-sans-arabic/files/*.woff2",
      "./node_modules/@ibm/plex-sans/fonts/complete/woff2/*.woff2",
      "./node_modules/@ibm/plex-sans-arabic/fonts/complete/woff2/*.woff2",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // SAMEORIGIN (not DENY): in-app PDF/HTML previews iframe same-origin
          // /api/files and proposal download routes. Cross-origin framing still blocked.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-XSS-Protection", value: "0" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",
          },
          ...(process.env.VERCEL
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
