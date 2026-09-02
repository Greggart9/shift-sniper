import { useState } from "react";
import { ArrowUpRight, Bot, Check, Circle, Cpu, LockKeyhole, ShieldCheck, Zap } from "lucide-react";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function LandingPage() {
  const [connected, setConnected] = useState(false);

  const handleWallet = () => setConnected((current) => !current);

  return (
    <main className="min-h-screen bg-shift-bg antialiased selection:bg-lime/20 selection:text-lime-bright">
      <div className="mx-auto px-5 lg:px-10">
        <header className="flex items-center justify-between gap-4 py-5 lg:py-6">
          <a href="#top" className="flex items-center gap-3" aria-label="SHIFT home">
            <span className="w-9 h-9 bg-shift-btn rounded-sm flex items-center justify-center font-bold text-shift-bg">S</span>
            <span className="leading-none">
              <h1 className="text-sm font-bold tracking-widest text-shift-text">SHIFT</h1>
              <p className="text-sm tracking-[0.06em] text-shift-muted ">Sniping cockpit</p>
            </span>
          </a>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary navigation">
            <a href="#cockpit" className="text-sm text-soft transition-colors hover:text-ink">Cockpit</a>
            <a href="#triggers" className="text-sm text-soft transition-colors hover:text-ink">Triggers</a>
            <a href="#access" className="text-sm text-soft transition-colors hover:text-ink">Access</a>
            <a href="#docs" className="text-sm text-soft transition-colors hover:text-ink">Docs</a>
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full px-3 py-2 ring-1 ring-line sm:flex">
              <span className="size-1.5 rounded-full bg-lime/70" />
              <span className="text-xs font-medium">Robinhood Chain</span>
            </div>
            <span> <ConnectButton/></span>
          </div>
        </header>

        <section id="top" className="grid grid-cols-1 gap-10 border-t border-line py-10 lg:grid-cols-12 lg:gap-8 lg:py-14">
          <div id="cockpit" className="lg:col-span-7">
            <div className="mb-6 inline-flex flex-wrap items-center gap-2 rounded-full px-3 py-1.5 ring-1 ring-line">
              <span className="text-[10px] uppercase tracking-[0.22em] text-subtle">Built for</span>
              <span className="text-xs font-medium text-soft">Robinhood Chain · Shift Chameleon holders</span>
            </div>

            <h1 className="max-w-[18ch] text-5xl font-semibold leading-[0.9] tracking-wider sm:text-6xl">
              Mint and snipe on-chain at terminal speed.
            </h1>
            <p className="mt-6 max-w-[48ch] text-base leading-relaxed text-soft">
              SHIFT is a token-gated NFT minting and sniping cockpit.<br/> Get your NFTs before the crowd sees the move.<br/> Connect a wallet to get started.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
             <span> <ConnectButton/></span>
              <button className="h-auto rounded-lg border flex border-shift-border bg-transparent px-3 py-2 text-sm font-medium">
                <a href="#access">How access works </a> <ArrowUpRight className="text-shift-btn" />
              </button>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-subtle">
              <span className="flex items-center gap-2"><Zap aria-hidden="true" className="size-3.5 text-lime" /> 100ms median execution</span>
              <span className="flex items-center gap-2"><Bot aria-hidden="true" className="size-3.5 text-lime" /> Automated triggers</span>
              <span className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-3.5 text-lime" /> Token-gated utility</span>
            </div>
          </div>

          <div id="access" className="lg:col-span-5">
            <div className="rounded-[14px] bg-panel p-6 ring-1 ring-line">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.22em] text-subtle">Access status</span>
                <span className="flex items-center gap-2">
                  <span className="status-pulse size-2 rounded-full bg-lime" />
                  <span className="text-[11px] font-medium text-lime-bright">{connected ? "Key detected" : "Awaiting key"}</span>
                </span>
              </div>

              <div className="mt-5 rounded-[10px] bg-carbon p-4 ring-1 ring-line">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-soft">Wallet</span>
                  <span className="font-medium text-ink">{connected ? "0x7A…41C2" : "Not connected"}</span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-soft">Chameleon key</span>
                  <span className="font-medium text-ink">{connected ? "1 detected" : "0 detected"}</span>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-soft">Execution latency</span>
                  <span className="font-head font-medium text-ink">100ms</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-line"><div className="h-full w-[92%] rounded-full bg-lime" /></div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-soft">Trigger engine</span>
                  <span className="font-medium text-lime-bright">{connected ? "Ready" : "Armed"}</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-line"><div className="h-full w-[68%] rounded-full bg-lime" /></div>
              </div>

              <div className="mt-5 flex items-center justify-between rounded-[10px] border border-dashed border-line px-4 py-3">
                <span className="text-xs text-soft">Mint window</span>
                <span className="font-head text-xs font-medium tracking-wide text-ink">{connected ? "Ready · 00:42:11" : "Locked · 00:42:11"}</span>
              </div>
            </div>
          </div>
        </section>



        <footer id="docs" className="flex flex-col gap-4 border-t border-line py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-subtle"><span className="status-pulse size-1.5 rounded-full bg-lime" /> System nominal · 100ms · Robinhood Chain</div>
          <div className="text-[11px] text-subtle">© 2026 SHIFT — token-gated operations terminal.</div>
        </footer>
      </div>
    </main>
  );
}

function Capability({ icon, value, title, copy }: { icon: React.ReactNode; value: React.ReactNode; title: string; copy: string }) {
  return (
    <div className="border-b border-line py-8 md:border-b-0 md:border-r md:px-8 first:pl-0 last:border-r-0 last:pr-0">
      <div className="text-lime">{icon}</div>
      <div className="mt-4 font-head text-3xl font-semibold tracking-tight text-ink">{value}</div>
      <div className="mt-2 text-sm font-medium text-soft">{title}</div>
      <p className="mt-2 max-w-[30ch] text-sm leading-relaxed text-subtle">{copy}</p>
    </div>
  );
}







// "use client";

// import { ConnectButton } from "@rainbow-me/rainbowkit";
// import { Zap, Lock, Cpu, Bot, ShieldCheck } from "lucide-react";

// export default function LandingPage() {
//   return (
//     <div className="min-h-screen bg-shift-navy text-shift-textMain flex flex-col justify-between font-sans relative overflow-hidden">
//       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-shift-cyan/10 rounded-full blur-[140px] pointer-events-none" />
//       <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-100 h-100 bg-shift-lime/10 rounded-full blur-[120px] pointer-events-none" />

//       <header className="w-full max-w-7xl mx-auto px-8 py-6 flex items-center justify-between z-10">
//         <div className="flex items-center space-x-3">
//           <div className="w-10 h-10 bg-shift-lime rounded-full flex items-center justify-center text-shift-navy font-bold text-xl shadow-[0_0_15px_rgba(197,224,0,0.3)]">
//             🦎
//           </div>
//           <span className="text-2xl font-black tracking-widest text-white">SHIFT</span>
//         </div>

//         <ConnectButton />
//       </header>

//       <main className="w-full max-w-5xl mx-auto px-8 py-12 flex flex-col items-center text-center z-10 my-auto">
//         <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/80 border border-slate-700 mb-8 text-sm text-shift-lime font-mono">
//           <Zap size={16} /> EXCLUSIVE ROBINHOOD L2 SNIPER
//         </div>

//         <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 leading-tight">
//           ADAPT TO THE SPEED OF <br />
//           <span className="text-transparent bg-clip-text bg-linear-to-r from-shift-lime via-emerald-400 to-shift-cyan">
//             ROBINHOOD CHAIN
//           </span>
//         </h1>

//         <p className="text-lg md:text-xl text-shift-textMuted max-w-2xl mb-10 leading-relaxed">
//           Automated, high-precision NFT minting and sniping bot engineered exclusively for
//           <span className="text-white font-semibold"> Shift Chameleon</span> holders.
//         </p>

//         <div className="p-1 rounded-xl bg-linear-to-r from-shift-lime/40 to-shift-cyan/40 mb-12">
//           <div className="bg-slate-950 px-8 py-6 rounded-lg flex items-center gap-4">
//             <Lock className="text-shift-lime" size={24} />
//             <span className="text-sm font-medium text-slate-300">
//               Connect your wallet in the top right to access the cockpit
//             </span>
//           </div>
//         </div>

//         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left mt-6">
//           <div className="bg-shift-card/60 backdrop-blur-md border border-slate-800 p-6 rounded-xl">
//             <Cpu className="text-shift-lime mb-4" size={28} />
//             <h3 className="font-bold text-lg mb-2">100ms Execution</h3>
//             <p className="text-shift-textMuted text-sm">
//               Built directly on Robinhood Chain WebSocket RPCs for near-instant block processing.
//             </p>
//           </div>

//           <div className="bg-shift-card/60 backdrop-blur-md border border-slate-800 p-6 rounded-xl">
//             <Bot className="text-shift-cyan mb-4" size={28} />
//             <h3 className="font-bold text-lg mb-2">Automated Triggers</h3>
//             <p className="text-shift-textMuted text-sm">
//               Set contract targets, price parameters, and front-running limits once, then let Shift handle the rest.
//             </p>
//           </div>

//           <div className="bg-shift-card/60 backdrop-blur-md border border-slate-800 p-6 rounded-xl">
//             <ShieldCheck className="text-emerald-400 mb-4" size={28} />
//             <h3 className="font-bold text-lg mb-2">Token-Gated Utility</h3>
//             <p className="text-shift-textMuted text-sm">
//               Exclusive proprietary dashboard available only to verified Shift NFT holders.
//             </p>
//           </div>
//         </div>
//       </main>

//       <footer className="w-full border-t border-slate-800/80 py-6 text-center text-xs text-shift-textMuted z-10">
//         © 2026 Shift NFT Collection. All rights reserved.
//       </footer>
//     </div>
//   );
// }
