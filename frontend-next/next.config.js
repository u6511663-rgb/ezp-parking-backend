/** @type {import('next').NextConfig} */
const API_PROXY_TARGET =
  process.env.API_PROXY_TARGET || "http://localhost:3000";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET.replace(/\\/+$/, "")}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;

