"use client";

import { useState } from "react";
import { Play, Zap, ShieldCheck, Sparkles, Lock, Flame } from "lucide-react";

interface SniperConfigProps {
  targetContract: string;
  chainId: number;
  setTargetContract: (val: string) => void;

  mintPrice: string;
  setMintPrice: (val: string) => void;

  maxQuantity: number;
  setMaxQuantity: (val: number) => void;

  functionName: string;
  setFunctionName: (val: string) => void;

  maxFeeGwei: string;
  setMaxFeeGwei: (val: string) => void;

  priorityTipGwei: string;
  setPriorityTipGwei: (val: string) => void;

  mode: "BURNER" | "PRESIGN";
  setMode: (val: "BURNER" | "PRESIGN") => void;

  useAllWallets: boolean;
  setUseAllWallets: (val: boolean) => void;

  savedWalletCount: number;

  isArmed: boolean;
  loading: boolean;

  onToggleArm: () => void;

  // Collection information returned by /api/inspect
  setCollectionName?: (val: string) => void;
  setCollectionSymbol?: (val: string) => void;
  setCollectionImage?: (val: string) => void;
}

export default function SniperConfig({
  targetContract,
  chainId,
  setTargetContract,

  mintPrice,
  setMintPrice,

  maxQuantity,
  setMaxQuantity,

  functionName,
  setFunctionName,

  maxFeeGwei,
  setMaxFeeGwei,

  priorityTipGwei,
  setPriorityTipGwei,

  mode,
  setMode,

  useAllWallets,
  setUseAllWallets,

  savedWalletCount,

  isArmed,
  loading,
  onToggleArm,

  setCollectionName,
  setCollectionSymbol,
  setCollectionImage,
}: SniperConfigProps) {
  const [fetchingInfo, setFetchingInfo] = useState(false);

  const [inspectError, setInspectError] = useState("");

  const handleContractChange = async (address: string) => {
    setTargetContract(address);

    setInspectError("");

    // Keep the existing configuration because page.tsx persists it in localStorage.

    if (address.length !== 42 || !address.startsWith("0x")) {
      return;
    }

    setFetchingInfo(true);

    try {
      const res = await fetch(`/api/inspect?address=${encodeURIComponent(address)}&chainId=${chainId}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setInspectError(data.error ?? "Could not inspect this contract.");

        return;
      }

      // Collection name

      if (typeof data.name === "string" && data.name.length > 0) {
        setCollectionName?.(data.name);
      }

      // Collection symbol is optional because /api/inspect may not return it.

      if (typeof data.symbol === "string") {
        setCollectionSymbol?.(data.symbol);
      }

      // Collection image is optional because /api/inspect may not return metadata.

      if (typeof data.image === "string") {
        setCollectionImage?.(data.image);
      }

      // Mint price

      if (typeof data.mintPrice === "string") {
        setMintPrice(data.mintPrice);
      }

      // Mint function

      if (typeof data.functionName === "string") {
        setFunctionName(data.functionName);
      }
    } catch (error) {
      console.error("Auto-fetch error:", error);

      setInspectError("Could not reach the contract inspection service.");
    } finally {
      setFetchingInfo(false);
    }
  };

  return (
    <div className="bg-shift-card border border-slate-700 rounded-xl p-6 mb-6 relative">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span className="text-shift-lime">🎯</span>
          SNIPER CONFIGURATION
        </h2>

        <div className="flex items-center gap-1.5 text-xs text-shift-cyan bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-lg">
          <Sparkles size={14} className={fetchingInfo ? "animate-spin" : ""} />

          {fetchingInfo ? "Scanning Chain..." : "Auto-Sync Active"}
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-xs text-shift-textMuted mb-2 font-mono uppercase">Execution Mode</label>

        <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setMode("BURNER")}
            disabled={isArmed}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${
              mode === "BURNER" ? "bg-shift-lime text-shift-navy" : "text-shift-textMuted hover:text-white"
            }`}
          >
            <Zap size={16} />
            PUBLIC / FCFS (Burner)
          </button>

          <button
            type="button"
            onClick={() => setMode("PRESIGN")}
            disabled={isArmed}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${
              mode === "PRESIGN" ? "bg-shift-cyan text-shift-navy" : "text-shift-textMuted hover:text-white"
            }`}
          >
            <ShieldCheck size={16} />
            WL PHASE (Pre-Sign)
          </button>
        </div>
      </div>

      {mode === "BURNER" && (
        <div className="mb-6 flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-bold text-shift-textMain cursor-pointer">
              <input
                type="checkbox"
                checked={useAllWallets}
                onChange={(e) => setUseAllWallets(e.target.checked)}
                disabled={isArmed}
                className="w-4 h-4 accent-shift-lime"
              />
              Snipe with all saved wallets
            </label>

            <p className="text-xs text-shift-textMuted mt-1 ml-6">
              {useAllWallets
                ? `Will sign and fire from all ${savedWalletCount} saved wallet(s), each independently.`
                : 'Uses only the wallet marked "Active Sniper Target".'}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs text-shift-textMuted mb-2 font-mono uppercase">Target Contract Address</label>

          <input
            type="text"
            value={targetContract}
            onChange={(e) => handleContractChange(e.target.value)}
            disabled={isArmed}
            placeholder="0x..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm focus:outline-none focus:border-shift-lime"
          />

          {fetchingInfo && (
            <p className="text-xs text-shift-cyan mt-2 font-mono">Reading collection data from chain...</p>
          )}

          {!fetchingInfo && inspectError && <p className="text-xs text-red-400 mt-2 font-mono">{inspectError}</p>}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="flex items-center justify-between text-xs text-shift-textMuted mb-2 font-mono uppercase">
              <span>Price (ETH)</span>

              <Lock size={12} className="text-slate-500" />
            </label>

            <input
              type="text"
              value={mintPrice}
              readOnly
              disabled
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3 font-mono text-sm text-shift-cyan"
            />
          </div>

          <div>
            <label className="block text-xs text-shift-textMuted mb-2 font-mono uppercase">Quantity</label>

            <input
              type="number"
              min={1}
              value={maxQuantity || ""}
              onChange={(e) => setMaxQuantity(Number(e.target.value))}
              disabled={isArmed}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm focus:outline-none focus:border-shift-lime"
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-xs text-shift-textMuted mb-2 font-mono uppercase">
              <span>Function</span>

              <Lock size={12} className="text-slate-500" />
            </label>

            <input
              type="text"
              value={functionName}
              readOnly
              disabled
              className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3 font-mono text-sm text-shift-lime"
            />
          </div>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-400 mb-3">
          <Flame size={16} />
          WAR MODE: EIP-1559 GAS CONTROLS
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] text-shift-textMuted mb-1 font-mono">Max Fee (Gwei)</label>

            <input
              type="text"
              value={maxFeeGwei}
              onChange={(e) => setMaxFeeGwei(e.target.value)}
              placeholder="e.g. 25"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] text-shift-textMuted mb-1 font-mono">Priority Tip (Gwei)</label>

            <input
              type="text"
              value={priorityTipGwei}
              onChange={(e) => setPriorityTipGwei(e.target.value)}
              placeholder="e.g. 5"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-amber-400 focus:border-amber-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleArm}
        disabled={loading}
        className={`w-full font-black text-xl py-4 rounded-lg flex items-center justify-center gap-3 transition-all ${
          mode === "PRESIGN"
            ? "bg-shift-cyan hover:bg-[#22a6e0] text-shift-navy"
            : "bg-shift-lime hover:bg-shift-limeHover text-shift-navy"
        } ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <Play fill="currentColor" size={24} />

        {loading ? "PROCESSING..." : mode === "PRESIGN" ? "SIGN & ARM SNIPER" : "ARM BURNER"}
      </button>
    </div>
  );
}
