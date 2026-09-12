/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pzpnxexubweqseotnixv.supabase.co",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/BubbleHouse", destination: "/catalog/bubble-house", permanent: true },
      { source: "/slidecombo", destination: "/catalog/bounce-slide-combo", permanent: true },
      { source: "/minibouncehouse", destination: "/catalog/mini-bounce-houses", permanent: true },
      { source: "/sets", destination: "/catalog/sets", permanent: true },
      { source: "/bouncehouses", destination: "/catalog/bounce-house", permanent: true },
      { source: "/softplay", destination: "/catalog/soft-play", permanent: true },
    ];
  },
}

module.exports = nextConfig
