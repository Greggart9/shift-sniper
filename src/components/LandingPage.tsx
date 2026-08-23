'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Zap, Lock, Cpu, Bot, ShieldCheck } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-shift-navy text-shift-textMain flex flex-col justify-between font-sans relative overflow-hidden">
      {/* Background Radial Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-shift-cyan/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-shift-lime/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Top Navbar */}
      <header className="w-full max-w-7xl mx-auto px-8 py-6 flex items-center justify-between z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-shift-lime rounded-full flex items-center justify-center text-shift-navy font-bold text-xl shadow-[0_0_15px_rgba(197,224,0,0.3)]">
            🦎
          </div>
          <span className="text-2xl font-black tracking-widest text-white">SHIFT</span>
        </div>

        <ConnectButton />
      </header>

      {/* Hero Section */}
      <main className="w-full max-w-5xl mx-auto px-8 py-12 flex flex-col items-center text-center z-10 my-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/80 border border-slate-700 mb-8 text-sm text-shift-lime font-mono">
          <Zap size={16} /> EXCLUSIVE ROBINHOOD L2 SNIPER
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-tight">
          ADAPT TO THE SPEED OF <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-shift-lime via-emerald-400 to-shift-cyan">
            ROBINHOOD CHAIN
          </span>
        </h1>

        <p className="text-lg md:text-xl text-shift-textMuted max-w-2xl mb-10 leading-relaxed">
          Automated, high-precision NFT minting and sniping bot engineered exclusively for 
          <span className="text-white font-semibold"> Shift Chameleon</span> holders.
        </p>

        <div className="p-1 rounded-xl bg-gradient-to-r from-shift-lime/40 to-shift-cyan/40 mb-12">
          <div className="bg-slate-950 px-8 py-6 rounded-lg flex items-center gap-4">
            <Lock className="text-shift-lime" size={24} />
            <span className="text-sm font-medium text-slate-300">
              Connect your wallet in the top right to access the cockpit
            </span>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left mt-6">
          <div className="bg-shift-card/60 backdrop-blur-md border border-slate-800 p-6 rounded-xl">
            <Cpu className="text-shift-lime mb-4" size={28} />
            <h3 className="font-bold text-lg mb-2">100ms Execution</h3>
            <p className="text-shift-textMuted text-sm">
              Built directly on Robinhood Chain WebSocket RPCs for near-instant block processing.
            </p>
          </div>

          <div className="bg-shift-card/60 backdrop-blur-md border border-slate-800 p-6 rounded-xl">
            <Bot className="text-shift-cyan mb-4" size={28} />
            <h3 className="font-bold text-lg mb-2">Automated Triggers</h3>
            <p className="text-shift-textMuted text-sm">
              Set contract targets, price parameters, and front-running limits once, then let Shift handle the rest.
            </p>
          </div>

          <div className="bg-shift-card/60 backdrop-blur-md border border-slate-800 p-6 rounded-xl">
            <ShieldCheck className="text-emerald-400 mb-4" size={28} />
            <h3 className="font-bold text-lg mb-2">Token-Gated Utility</h3>
            <p className="text-shift-textMuted text-sm">
              Exclusive proprietary dashboard available only to verified Shift NFT holders.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 py-6 text-center text-xs text-shift-textMuted z-10">
        © 2026 Shift NFT Collection. All rights reserved.
      </footer>
    </div>
  );
}