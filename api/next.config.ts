import type { NextConfig } from 'next';

/**
 * API-only backend. There are no pages — every route lives under `app/api/*`.
 * All third-party keys (ANTHROPIC / FAL / ELEVENLABS) stay server-side here.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
