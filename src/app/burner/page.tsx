"use client";

import { useAccount, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import LandingPage from "@/components/LandingPage";
import Sidebar from "@/components/Sidebar";
import BurnerWalletManager from "@/components/BurnerWalletManager";
import { DEFAULT_CHAIN_ID, getChainConfig, SUPPORTED_CHAINS } from "@/lib/chains";

export default function BurnerPage() {
  const { isConnected } = useAccount();
  const connectedChainId = useChainId();
  const chainId = SUPPORTED_CHAINS.some((chain) => chain.id === connectedChainId)
    ? connectedChainId
    : DEFAULT_CHAIN_ID;
  const chainLabel = getChainConfig(chainId).label;

  // Protect the route: Show landing if wallet disconnects
  if (!isConnected) {
    return <LandingPage />;
  }

  return (
    <div className="min-h-screen bg-shift-navy text-shift-textMain flex font-sans">
      <Sidebar />

      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8 gap-4">
          <ConnectButton showBalance={false} />

          <div className="bg-shift-card border border-slate-700 px-6 py-3 rounded-lg flex items-center justify-between min-w-55">
            <span className="text-shift-textMuted">{chainLabel} Gas</span>
            <span className="font-mono text-shift-lime">12.4 Gwei</span>
          </div>
        </header>

        <BurnerWalletManager />
      </main>
    </div>
  );
}
