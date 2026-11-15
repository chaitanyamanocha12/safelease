import type { NextConfig } from "next";

/**
 * SafeLease Next.js configuration.
 *
 * Cache Components is intentionally disabled: nearly every route renders
 * private, per-user data, so we render dynamically per request rather than
 * risk caching one renter's case data into a shared static shell.
 */
const isDev = process.env.NODE_ENV !== "production";
// 'unsafe-inline' scripts are required by Next.js without a nonce-based setup (documented in SECURITY.md).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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
