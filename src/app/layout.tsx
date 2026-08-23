import './globals.css';
import { Providers } from './providers'; // or your existing wagmi/rainbowkit provider wrapper
import { Toaster } from 'sonner';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: "SHIFT Sniper | Exclusive NFT Dashboard",
  description: "Advanced minting and sniping tools for Shift Chameleon holders on Robinhood Chain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-shift-navy text-shift-textMain font-sans">
        <Providers>
          {children}
          <Toaster richColors position="bottom-right" theme="dark" />
        </Providers>
      </body>
    </html>
  );
}