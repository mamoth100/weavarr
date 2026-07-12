import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { WatchlistProvider } from '@/hooks/useWatchlist';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'DocuView — Documentary Discovery',
  description:
    'Discover, sort, and filter the best documentaries across every genre.',
};

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
