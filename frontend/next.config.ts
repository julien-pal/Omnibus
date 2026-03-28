import type { NextConfig } from 'next';

const basePath = process.env.BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath,
  assetPrefix: basePath,
  outputFileTracingRoot: require('path').join(__dirname, '../'),
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8686/api/:path*',
      },
    ];
  },
};

export default nextConfig;
