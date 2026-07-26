/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    // androidtv-remote pulls in systeminformation + node-forge, both of which
    // do Node-native things (fs reads, platform detection) that break when
    // webpack tries to bundle them for the server build ("Cannot read
    // properties of null (reading 'readFileSync')" during page-data
    // collection). Externalizing them makes Next.js `require()` them
    // natively at runtime instead of bundling them.
    serverComponentsExternalPackages: ['androidtv-remote', 'systeminformation', 'node-forge'],
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
