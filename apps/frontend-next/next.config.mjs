/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://localhost:3200";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` }
    ];
  }
};

export default nextConfig;
