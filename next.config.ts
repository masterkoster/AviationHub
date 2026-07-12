import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async redirects() {
    return [
      // Phase 0 route consolidation: /modules/* duplicates point at the
      // canonical trees. Temporary (307) until the duplicate code is deleted.
      { source: "/modules/fuel-saver", destination: "/fuel-saver", permanent: false },
      { source: "/modules/fuel-saver/:path*", destination: "/fuel-saver/:path*", permanent: false },
      { source: "/modules/logbook", destination: "/logbook", permanent: false },
      { source: "/modules/marketplace", destination: "/marketplace", permanent: false },
      { source: "/modules/marketplace/create", destination: "/marketplace", permanent: false },
      { source: "/modules/marketplace/saved", destination: "/marketplace", permanent: false },
      { source: "/modules/flying-club", destination: "/flying-club", permanent: false },
      { source: "/modules/flying-club/manage", destination: "/flying-club/admin", permanent: false },
      { source: "/modules/flying-club/manage/:section", destination: "/flying-club/admin", permanent: false },
      { source: "/modules/scheduler-preview", destination: "/flying-club", permanent: false },
      // Retired surfaces (messaging/social/friends cut from the product)
      { source: "/messages", destination: "/dashboard", permanent: false },
      { source: "/modules/social", destination: "/dashboard", permanent: false },
      { source: "/modules/social/:path*", destination: "/dashboard", permanent: false },
      { source: "/modules/pilot-directory", destination: "/dashboard", permanent: false },
      { source: "/modules/pilot-overview", destination: "/dashboard", permanent: false },
    ];
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "frame-src 'self' blob: data:",
      "child-src 'self' blob: data:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
      "connect-src 'self' https: wss: http://ipc.localhost http://localhost:* https://www.google-analytics.com",
    ].join("; ");

    const desktopCsp = [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://ipc.localhost http://localhost:*",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: https: http://localhost:*",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' http: https: wss: ws: http://ipc.localhost http://localhost:* ipc: http://ipc.localhost",
    ].join("; ");

    return [
      {
        source: "/desktop/:path*",
        headers: [
          { key: "Content-Security-Policy", value: desktopCsp },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(self), microphone=(), camera=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
      {
        source: "/",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/((?!_next/|api/|icons/|manifest.json).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
