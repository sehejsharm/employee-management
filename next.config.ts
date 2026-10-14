import type { NextConfig } from "next";

/**
 * Security headers sent with every response. The app is an internal tool: it
 * must never be framed, never be indexed, and never leak its URLs.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  experimental: {
    serverActions: {
      // Document uploads go through a Server Action. Vercel caps request
      // bodies at 4.5 MB, so the app enforces MAX_UPLOAD_MB (default 4).
      bodySizeLimit: "5mb",
    },
    optimizePackageImports: ["lucide-react", "date-fns", "motion", "radix-ui"],
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // The service worker (phone notifications): always fetch the latest version.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
