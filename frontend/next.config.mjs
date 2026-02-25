/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Proxy API calls through Next.js to avoid iOS Safari cross-origin issues
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

    // In production (Vercel), we might not want to rewrite if we are hitting Render directly
    // but keeping it allows the frontend to hide the backend URL if we want to.
    // Usually, hitting the backend directly is faster for serverless.
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/:path*`, // Proxy to Backend
      },
    ];
  },

  // Allow cross-origin requests from LAN IPs in development
  allowedDevOrigins: [
    'http://192.168.8.104:3000',
    'http://192.168.8.*:3000',
    'http://192.168.*.*:3000',
    'http://localhost:3000',
  ],
};

export default nextConfig;