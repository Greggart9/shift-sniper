import './globals.css';
import { Providers } from './providers'; // or your existing wagmi/rainbowkit provider wrapper
import { Toaster } from 'sonner';
import { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import ResponsiveGuard from '@/components/ResponsiveGuard';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "SHIFT Sniper | Exclusive NFT Dashboard",
  description: "Advanced minting and sniping tools for Shift Chameleon holders on Robinhood Chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body className=" bg-red-400 text-shift-textMain font-sans m-0 p-0 ">
        <Providers>
          <ResponsiveGuard>
            {children}
          </ResponsiveGuard>
          <Toaster richColors position="bottom-right" theme="dark" />
        </Providers>
      </body>
    </html>
  );
}