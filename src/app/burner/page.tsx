'use client';

import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';

import LandingPage from '@/components/LandingPage';
import Sidebar from '@/components/Sidebar';
import BurnerWalletManager from '@/components/BurnerWalletManager';

export default function BurnerPage() {
  const { isConnected } = useAccount();

  // Protect the route: Show landing if wallet disconnects
  if (!isConnected) {
    return <LandingPage />;
  }

  return (
    <div className="min-h-screen bg-shift-navy text-shift-textMain flex font-sans">
      <Sidebar />

      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8 gap-4">
          {/* Fix: Hides the buggy NaN ETH readout */}
          <ConnectButton showBalance={false} />
          
          <div className="bg-shift-card border border-slate-700 px-6 py-3 rounded-lg flex items-center justify-between min-w-[220px]">
            <span className="text-shift-textMuted">Robinhood L2 Gas</span>
            <span className="font-mono text-shift-lime">12.4 Gwei</span>
          </div>
        </header>

        {/* Burner component now lives entirely on this page */}
        <BurnerWalletManager />
      </main>
    </div>
  );
}