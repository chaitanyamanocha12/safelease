import type { NextConfig } from "next";

/**
 * SafeLease Next.js configuration.
 *
 * Cache Components is intentionally disabled: nearly every route renders
 * private, per-user data, so we render dynamically per request rather than
 * risk caching one renter's case data into a shared static shell.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "tesseract.js", "@libsql/client", "libsql", "unpdf"],
  experimental: {
    serverActions: {
      // Uploads are validated again server-side (type + size) in the upload service.
      bodySizeLimit: "26mb",
    },
  },
  images: {
    unoptimized: false,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
