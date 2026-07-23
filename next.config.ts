import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  reactStrictMode: true,
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
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "0" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          ...(process.env.VERCEL ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
