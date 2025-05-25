import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.natsucloud.com',
        port: '',
        search: '',
      },
    ],
  }
};

export default nextConfig;
