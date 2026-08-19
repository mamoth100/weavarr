import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { WatchlistProvider } from '@/hooks/useWatchlist';
import { getRawEnvValue } from '@/lib/settings';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// APP_TITLE reads straight off disk (like the menu settings), so a rename
// shows up on the next page load without a restart.
export async function generateMetadata(): Promise<Metadata> {
  const custom = (await getRawEnvValue('APP_TITLE'))?.trim();
  return {
    title: custom || 'Weavarr - Discover Anything',
    description: 'Discover, sort, and filter movies and TV across every genre.',
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: custom || 'Weavarr',
    },
    icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-zinc-950 text-white antialiased`}>
        <WatchlistProvider>{children}</WatchlistProvider>
      </body>
    </html>
  );
}
