/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://localhost:3200";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` }
    ];
  },
  /* SW + manifest must revalidate immediately after deploy (no CDN/browser stale install). */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" }]
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" }]
      }
    ];
  }
};

export default nextConfig;
