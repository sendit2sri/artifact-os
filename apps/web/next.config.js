/** @type {import('next').NextConfig} */
const nextConfig = {
  // This routes /api requests to the Python backend when running 'npm run dev'
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
  
  // ✅ HMR Stability: Ensure proper chunk loading paths
  // No basePath or assetPrefix = chunks load from same origin (correct)
  // basePath: undefined,
  // assetPrefix: undefined,
  
  // ✅ Turbopack Config: Empty config silences Next.js 16 warning
  // Turbopack works fine with default settings for this app
  turbopack: {},
  
  // ✅ Webpack Fallback: Explicit config ensures webpack mode works
  // Used when running: npm run dev:webpack or npm run dev:recovery
  webpack: (config, { dev, isServer }) => {
    // Add any custom webpack config here if needed
    // This ensures webpack mode works when Turbopack fails
    return config;
  },
  
  // ✅ Dev Mode Optimizations
  ...(process.env.NODE_ENV === 'development' && {
    experimental: {
      // Future: Add experimental features here if needed
    },
  }),
};

module.exports = nextConfig;
