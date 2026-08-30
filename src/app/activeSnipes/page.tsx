"use client";

import { useState } from "react";
import { useAccount, useChainId } from "wagmi";

import LandingPage from "@/components/LandingPage";
import Sidebar from "@/components/Sidebar";
import { DEFAULT_CHAIN_ID, getChainConfig, SUPPORTED_CHAINS } from "@/lib/chains";
import ActiveSnipesList from "@/components/ActiveSnipesList";


export default function ActiveSnipesPage() {
  const { isConnected, address } = useAccount();
  const connectedChainId = useChainId();
  const chainId = SUPPORTED_CHAINS.some((chain) => chain.id === connectedChainId)
    ? connectedChainId
    : DEFAULT_CHAIN_ID;
  const chainLabel = getChainConfig(chainId).label;
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "0x0000...0000";

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Protect the route: Show landing if wallet disconnects
  if (!isConnected) {
    return <LandingPage />;
  }

  return (
    <div className="min-h-screen bg-[#0B1022] text-shift-textMain flex overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-slate-800 px-8 py-4 bg-shift-navy/50 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl leading-none font-bold tracking-[0.04em] text-white">Active Snipes</h1>
              <p className="text-sm text-shift-textMuted mt-1">Monitor and manage active sniper tasks</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]">
                <span className="h-2.5 w-2.5 rounded-full bg-shift-lime shadow-[0_0_12px_rgba(197,224,0,0.8)]" />
                <span>{chainLabel}</span>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]">
                <span className="h-2.5 w-2.5 rounded-full border border-slate-500 bg-slate-200" />
                <span>{shortAddress}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-8">
          <ActiveSnipesList
            refreshTrigger={refreshTrigger}
            onTaskDisarmed={() => {
              setRefreshTrigger((prev) => prev + 1);
            }}
            maxTasks={5}
          />
        </div>
      </main>
    </div>
  );
}
