import type { NextConfig } from "next";
import path from "path";

const notoTraceWeights = Object.freeze([300, 400, 500, 600, 700]);
const plexTraceWeights = Object.freeze([
  "Light",
  "Regular",
  "Medium",
  "SemiBold",
  "Bold",
]);

export const bilingualFontTraceIncludes = Object.freeze([
  ...notoTraceWeights.map(
    (weight) =>
      `./node_modules/@fontsource/noto-sans/files/noto-sans-latin-${weight}-normal.woff2`,
  ),
  ...notoTraceWeights.map(
    (weight) =>
      `./node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-${weight}-normal.woff2`,
  ),
  ...plexTraceWeights.map(
    (weight) =>
      `./node_modules/@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-${weight}.woff2`,
  ),
  ...plexTraceWeights.map(
    (weight) =>
      `./node_modules/@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-${weight}.woff2`,
  ),
]);

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
    "/api/proposals/*/download": [...bilingualFontTraceIncludes],
    "/api/contracts/templates/*/preview": [...bilingualFontTraceIncludes],
    "/api/business-profile/export": [...bilingualFontTraceIncludes],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // Defence in depth behind output escaping, not a replacement for it.
            //
            // - `object-src 'none'` and `base-uri 'self'` remove the two sinks
            //   that survive most HTML-injection fixes.
            // - `frame-ancestors 'self'` is the CSP equivalent of the
            //   X-Frame-Options below and is the directive modern browsers
            //   actually honour.
            // - `script-src` keeps 'unsafe-inline' and 'unsafe-eval': Next.js
            //   injects inline bootstrap scripts and the App Router dev overlay
            //   needs eval. Tightening this requires per-request nonces through
            //   the proxy, which is a separate change with its own rollout.
            // - `img-src` allows data: and blob: because brand logos are inlined
            //   as data URIs for PDF rendering and previews use object URLs.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'self'",
              "form-action 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "media-src 'self' blob:",
              "worker-src 'self' blob:",
              "frame-src 'self' blob:",
              "manifest-src 'self'",
            ].join("; "),
          },
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
