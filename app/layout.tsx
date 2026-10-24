import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KeoTV - Lecteur IPTV Android TV & Mobile',
  description: 'Application IPTV moderne haute performance inspirée de TiviMate.',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0d14',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark min-h-full w-full bg-[#0a0d14]">
      <body className="min-h-full w-full bg-[#0a0d14] text-slate-100 font-tv antialiased select-none">
        {children}
      </body>
    </html>
  );
}
