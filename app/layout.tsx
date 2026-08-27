import type { Metadata } from 'next';
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
