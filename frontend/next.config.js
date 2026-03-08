/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  
  // Proxy /api/* and /health to the backend server
  // This enables tunnel access (hal.bendwebs.com) where frontend and backend
  // are served through the same domain
  async rewrites() {
    // Only proxy when not already on a backend port
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/health',
        destination: `${backendUrl}/health`,
      },
    ];
  },
};

module.exports = nextConfig;
