"use client";

import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import LandingPage from "@/components/LandingPage";
import Sidebar from "@/components/Sidebar";
import SniperInstructions from "@/components/SniperInstructions";

export default function InstructionsPage() {
  const { isConnected } = useAccount();

  // Protect the route: Show landing if wallet disconnects
  if (!isConnected) {
    return <LandingPage />;
  }

  return (
    <div className="h-screen w-screen bg-shift-navy text-shift-textMain flex overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-slate-800 px-8 py-6 bg-shift-navy/50 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl leading-none font-bold tracking-[0.04em] text-white">Operational Guidelines</h1>
              <p className="text-sm text-slate-300 mt-1">Safety rules and best practices</p>
            </div>
            <ConnectButton showBalance={false} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-8 max-w-6xl mx-auto">
            <SniperInstructions />
          </div>
        </div>
      </main>
    </div>
  );
}
