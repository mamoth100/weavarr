/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    // The dashboard's default genre depends on server-side Settings state, not the URL -
    // without this, client-side Link navigation back to "/" can reuse a stale cached
    // render from before a Settings change (e.g. still showing Reality TV after switching
    // to All Genres).
    staleTimes: {
      dynamic: 0,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
    ],
  },
};

export default nextConfig;
