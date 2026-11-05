import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Use the repo-root .env (one config file for the whole monorepo).
const rootEnv = resolve(__dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The browser talks only to this origin; /api is proxied to the API so auth cookies stay first-party.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }];
  },
  async headers() {
    return [
      {
        // The mobile map (/embed/map) holds no session or data and may be framed by the app's web preview.
        source: '/embed/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      {
        source: '/((?!embed/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
