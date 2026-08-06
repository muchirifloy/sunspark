import type { NextConfig } from "next";
import path from "node:path";

const backendImageUrl = new URL(
  process.env.NEXT_PUBLIC_BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "https://backend.sunsparkelectricals.co.ke"
);

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true
  },
  experimental: {
    // Shared hosting has a strict process limit. Keep page-data collection to one worker.
    cpus: 1,
    workerThreads: true,
    // Images are limited to 2 MB each in the upload service. Allow a small gallery
    // to reach its Server Action without exposing an unnecessarily large payload.
    serverActions: {
      bodySizeLimit: "24mb"
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
          { key: "Permissions-Policy", value: "camera=(), microphone=()" }
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
