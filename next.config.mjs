/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a minimal, self-contained server (node_modules pruned to only
  // what's actually used) - needed for a small, fast Docker image.
  output: 'standalone',
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
    // TMDB artwork is fetched once by the server and served from its own
    // disk cache after that (the entrypoint keeps that cache in the data
    // volume). An image path on TMDB never changes content, so a month is
    // safe; a new poster is a new path.
    minimumCacheTTL: 60 * 60 * 24 * 30,
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
