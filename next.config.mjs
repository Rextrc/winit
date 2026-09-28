/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Runs src/instrumentation.ts at server start — it drives sports settlement.
    instrumentationHook: true,
  },
};

export default nextConfig;
