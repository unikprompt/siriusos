import type { Metadata } from 'next';
import { Sora, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['500', '600', '700'],
});

const siteUrl = 'https://siriusos.unikprompt.com';
const ogImage = `${siteUrl}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'SiriusOS — Persistent AI agents, always on',
  description:
    'A fleet of Claude-powered AI agents that never go to sleep. Self-hosted, npm-installable, dashboard included. Telegram, crons, multi-agent orchestration.',
  keywords: [
    'siriusos',
    'claude code',
    'ai agents',
    'persistent agents',
    'multi-agent orchestration',
    'telegram bots',
    'cron scheduling',
    'self-hosted',
  ],
  authors: [{ name: 'Mario Edwards', url: 'https://unikprompt.com' }],
  creator: 'Mario Edwards',
  publisher: 'UnikPrompt',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['es_ES'],
    url: siteUrl,
    siteName: 'SiriusOS',
    title: 'SiriusOS — Persistent AI agents, always on',
    description:
      'A fleet of Claude-powered AI agents that never go to sleep. Self-hosted, npm-installable, dashboard included.',
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: 'SiriusOS — Persistent AI agents',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SiriusOS — Persistent AI agents, always on',
    description:
      'A fleet of Claude-powered AI agents that never go to sleep. Self-hosted, npm-installable.',
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
