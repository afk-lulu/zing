import type { NextConfig } from 'next';

/**
 * API-only backend. There are no pages — every route lives under `app/api/*`.
 * All third-party keys (ANTHROPIC / FAL / ELEVENLABS) stay server-side here.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `fixtures/` is not web-served and nothing imports it, so tracing would leave
  // it out of the bundle. /api/assets reads the style reference off disk when
  // ZING_IMAGE_REF is set (lib/fal.ts), which only works if the file ships.
  outputFileTracingIncludes: {
    '/api/assets': ['./fixtures/style-reference.jpg'],
  },
};

export default nextConfig;
