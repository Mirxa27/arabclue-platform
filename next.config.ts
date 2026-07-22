import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone is for self-hosted Docker/VPS; Vercel uses its own output.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
