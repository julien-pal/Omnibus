import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
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
