import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['cyrillic', 'latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['cyrillic', 'latin'],
});

export const metadata: Metadata = {
  title: 'REPPY — тренировки для тренера и ученика',
  description: 'Интерактивный прототип сервиса персональных тренировок REPPY.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'REPPY',
  },
  openGraph: {
    title: 'REPPY — тренируй, выполняй, расти',
    description: 'Тренер создаёт и назначает тренировку. Ученик выполняет. Результат видят оба.',
    type: 'website',
    locale: 'ru_RU',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'REPPY — тренируй, выполняй, расти' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'REPPY — тренируй, выполняй, расти',
    description: 'Интерактивный прототип сервиса персональных тренировок.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#070908',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
