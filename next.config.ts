import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
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
      // Next.js needs inline scripts; dev needs eval. Tighten later with nonces.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
      // Allow API calls and realtime.
      "connect-src 'self' https: wss: http://ipc.localhost http://localhost:* https://www.google-analytics.com",
    ].join('; ');

    // Desktop routes get a more permissive CSP that allows Tauri IPC
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
    ].join('; ');

    return [
      {
        source: '/desktop/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: desktopCsp },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(self), microphone=(), camera=()' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/((?!_next/|api/|icons/|manifest.json).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
