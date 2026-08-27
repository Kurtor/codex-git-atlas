import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
export const metadata: Metadata = {
  metadataBase: new URL('https://github.com/Kurtor/codex-git-atlas'),
  title: 'Git Atlas — Visual Git history for Codex',
  description: 'A fast, keyboard-first Git branch tree built for Codex workflows.',
  openGraph: { title: 'Git Atlas', description: 'Visual Git history for Codex', images: ['https://raw.githubusercontent.com/Kurtor/codex-git-atlas/master/public/og.png'] },
  twitter: { card: 'summary_large_image', title: 'Git Atlas', description: 'Visual Git history for Codex', images: ['https://raw.githubusercontent.com/Kurtor/codex-git-atlas/master/public/og.png'] },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html> }
