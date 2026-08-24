import type { NextConfig } from "next";
import path from "node:path";

const backendImageUrl = new URL(
  process.env.NEXT_PUBLIC_BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "https://backend.sunsparkelectricals.co.ke"
);

const backendOrigin = backendImageUrl.origin;

// 'unsafe-inline' is still required for scripts: the JSON-LD blocks and Next's
// own bootstrap are inline, and nothing here can carry a per-request nonce while
// pages are served from the static shell. The policy still blocks injected
// third-party script hosts, framing, and <base> hijacking, which is the bulk of
// what a storefront CSP buys. The Google entries are what the Maps JS SDK on the
// checkout location picker pulls in.
const isDevelopment = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Webpack's dev server evaluates modules with eval() for hot reloading, so
  // development needs 'unsafe-eval'. Production must never carry it.
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://maps.googleapis.com https://maps.gstatic.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${backendOrigin} https://sunspark.co.ke https://*.googleapis.com https://*.gstatic.com https://*.google.com`,
  // Hot reloading talks to the dev server over a WebSocket, which needs its own
  // scheme allowance. Production has no such connection.
  `connect-src 'self' ${backendOrigin} https://maps.googleapis.com${isDevelopment ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
  "manifest-src 'self'",
  // Local development serves the API over plain HTTP, so only force the upgrade
  // where everything is already behind TLS.
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"])
].join("; ");

const nextConfig: NextConfig = {
  // Loading the dev server through 127.0.0.1 instead of localhost otherwise trips
  // Next's cross-origin guard and blocks its dev resources. Development only.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    // Shared hosting has a strict process limit. Keep page-data collection to one worker.
    cpus: 1,
    workerThreads: true,
    // Gallery images travel to their Server Action as base64, which costs a third
    // more than the raw bytes. This budget matches the 5 MB per-image limit and
    // the batch guard in lib/uploads/product-images.ts.
    serverActions: {
      bodySizeLimit: "32mb"
    }
  },
  images: {
    // Product images are optimized before they are stored by the backend. Serve
    // those files directly so storefront availability does not depend on the
    // Vercel Image Optimization quota.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sunspark.co.ke"
      },
      {
        protocol: backendImageUrl.protocol.replace(":", "") as "http" | "https",
        hostname: backendImageUrl.hostname,
        port: backendImageUrl.port,
        pathname: "/uploads/**"
      },
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/uploads/**"
      }
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=()" },
          ...(isDevelopment
            ? []
            : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
          { key: "Content-Security-Policy", value: contentSecurityPolicy }
        ]
      }
    ];
  },
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@": path.resolve(__dirname)
    };
    return config;
  }
};

export default nextConfig;
