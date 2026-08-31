"use client";

import { useAccount, useChainId } from "wagmi";

import LandingPage from "@/components/LandingPage";
import Sidebar from "@/components/Sidebar";
import BurnerWalletManager from "@/components/BurnerWalletManager";
import { DEFAULT_CHAIN_ID, getChainConfig, SUPPORTED_CHAINS } from "@/lib/chains";

export default function BurnerPage() {
  const { isConnected, address } = useAccount();
  const connectedChainId = useChainId();
  const chainId = SUPPORTED_CHAINS.some((chain) => chain.id === connectedChainId)
    ? connectedChainId
    : DEFAULT_CHAIN_ID;
  const chainLabel = getChainConfig(chainId).label;
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "0x0000...0000";

  // Protect the route: Show landing if wallet disconnects
  if (!isConnected) {
    return <LandingPage />;
  }

  return (
    <div className="h-screen w-screen text-shift-textMain flex overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-shift-border px-8 py-4 bg-shift-bg backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl leading-none font-bold tracking-[0.04em]">Burner Wallet Manager</h1>
              <p className="text-sm text-shift-Muted mt-1">Create and manage burner accounts for minting</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-shift-border bg-shift-surface px-3 py-2.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-shift-btn" />
                <span>{chainLabel}</span>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-shift-border bg-shift-surface px-3 py-2.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-full border border-slate-500 bg-slate-200" />
                <span>{shortAddress}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-[1600px] mx-auto">
            <BurnerWalletManager />
          </div>
        </div>
      </main>
    </div>
  );
}
