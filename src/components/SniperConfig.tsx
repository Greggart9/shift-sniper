"use client";

import { useState } from "react";
import { Play, Sparkles, Lock, CircleCheck, CircleX, CircleHelp, Target } from "lucide-react";
import { getWalletEligibility, type WalletEligibility } from "@/lib/eligibility";
import { useAccount } from "wagmi";
import { getBurnerWalletMetadata, getBurnerWallets } from "@/lib/burnerVault";

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

  phaseType: "PUBLIC" | "GUARANTEED_WL" | "FCFS_WL";
  setPhaseType: (val: "PUBLIC" | "GUARANTEED_WL" | "FCFS_WL") => void;
  merkleRoot: string;
  setMerkleRoot: (val: string) => void;
  merkleProofsJson: string;
  setMerkleProofsJson: (val: string) => void;
  mintCalldata: string;
  setMintCalldata: (val: string) => void;
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

  useAllWallets,
  setUseAllWallets,

  savedWalletCount,

  isArmed,
  loading,
  onToggleArm,

  setCollectionName,
  setCollectionSymbol,
  setCollectionImage,
  phaseType,
  setPhaseType,
  merkleRoot,
  setMerkleRoot,
  merkleProofsJson,
  setMerkleProofsJson,
  mintCalldata,
  setMintCalldata,
}: SniperConfigProps) {
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const { address } = useAccount();

  const [inspectError, setInspectError] = useState("");
  const burnerAddresses = (() => {
    if (typeof window === "undefined") return [];
    const wallets = address ? getBurnerWallets(address) : [];
    const metadata = address ? getBurnerWalletMetadata(address) : [];
    return (wallets.length > 0 ? wallets : metadata).map((wallet) => wallet.address);
  })();

  const eligibilityIcon = (status: WalletEligibility) => {
    if (status === "VERIFIED") return <CircleCheck size={14} className="text-shift-lime" />;
    if (status === "NOT_VERIFIED") return <CircleX size={14} className="text-red-400" />;
    return <CircleHelp size={14} className="text-amber-400" />;
  };

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
    <div className="border border-shift-border bg-shift-surface rounded-xl px-6 py-4 mb-4 relative">
      <div className="flex items-center justify-between mb-6">

        <h2 className="font-bold text-shift-head flex items-center gap-2 text-sm tracking-widest">
          <Target size={15} className="text-shift-icon " />
          SNIPER CONFIGURATION
        </h2>

        <div className="flex items-center gap-1.5 text-xs text-shift-cyan bg-shift-bg border border-shift-border px-3 py-2.5 rounded-lg">
          <Sparkles size={14} className={fetchingInfo ? "animate-spin" : ""} />

          {fetchingInfo ? "Scanning Chain..." : "Auto-Sync Active"}
        </div>
      </div>
       
       {/* FIRST SET */}
      <div className="mb-4 flex items-center justify-between bg-shift-accent border border-shift-border rounded-xl p-4">
          <div className="w-1/2">
            <label className="flex items-center gap-2 text-sm font-bold  cursor-pointer">
              <input
                type="checkbox"
                checked={useAllWallets}
                onChange={(e) => setUseAllWallets(e.target.checked)}
                disabled={isArmed}
                className="w-4 h-4 accent-shift-lime"
              />
              Snipe with all saved wallets
            </label>

            <p className="text-xs text-shift-Muted mt-1 ml-6">
              {useAllWallets
                ? `Will sign and fire from all ${savedWalletCount} saved wallet(s), each independently.`
                : 'Uses only the wallet marked "Active Sniper Target".'}
            </p>
          </div>

         {/* CONTRACT ADDRESS INPUT */}
        <div className="w-1/2">
          <label className="block text-xs text-shift-Muted mb-2 font-mono uppercase">Target Contract Address</label>

          <input
            type="text"
            value={targetContract}
            onChange={(e) => handleContractChange(e.target.value)}
            disabled={isArmed}
            placeholder="0x..."
            className=" bg-shift-input border border-shift-border w-full  rounded-lg p-3 font-mono text-sm focus:outline-none focus:border-shift-lime"
          />

          {fetchingInfo && (
            <p className="text-xs text-shift-cyan mt-2 font-mono">Reading collection data from chain...</p>
          )}

          {!fetchingInfo && inspectError && <p className="text-xs text-red-400 mt-2 font-mono">{inspectError}</p>}
        </div>

      </div>

      <div className="mb-4 bg-shift-accent border border-shift-border rounded-xl p-4">
        <label className="block text-xs text-shift-Muted mb-2 font-mono uppercase tracking-widest">Mint Phase</label>
        <select
          value={phaseType}
          onChange={(event) => setPhaseType(event.target.value as typeof phaseType)}
          disabled={isArmed}
          className="w-full bg-shift-input border border-shift-border cursor-pointer rounded-md p-3 font-mono text-sm "
        >
          <option value="PUBLIC">Public</option>
          <option value="GUARANTEED_WL">Guaranteed WL</option>
          <option value="FCFS_WL">FCFS WL</option>
        </select>

        {phaseType !== "PUBLIC" && (
          <div className="space-y-3 mt-4">
            <input
              value={merkleRoot}
              onChange={(event) => setMerkleRoot(event.target.value)}
              disabled={isArmed}
              placeholder="Merkle root (0x...)"
              className="w-full bg-shift-input border border-shift-border rounded-md p-3 font-mono text-xs"
            />
            <textarea
              value={merkleProofsJson}
              onChange={(event) => setMerkleProofsJson(event.target.value)}
              disabled={isArmed}
              rows={3}
              placeholder={'{"0xWalletAddress":["0xProofNode"]}'}
              className="w-full bg-shift-input border border-shift-border rounded-md p-3 font-mono text-xs"
            />
            <textarea
              value={mintCalldata}
              onChange={(event) => setMintCalldata(event.target.value)}
              disabled={isArmed}
              rows={2}
              placeholder="Encoded WL mint calldata (0x...). Required for this first WL build."
              className="w-full bg-shift-input border border-shift-border rounded-md p-3 font-mono text-xs"
            />
            <p className="text-[11px] text-slate-500">Address-leaf Merkle proofs are checked locally. Signature-based phases need their collection-specific payload.</p>
            {burnerAddresses.length > 0 && (
              <div className="space-y-1 text-xs font-mono">
                {burnerAddresses.map((address) => {
                  const status = getWalletEligibility(address as `0x${string}`, phaseType, merkleRoot, merkleProofsJson);
                  return <div key={address} className="flex items-center gap-2">{eligibilityIcon(status)} {address.slice(0, 8)}...{address.slice(-6)} {status}</div>;
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4 mb-4">

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="flex items-center justify-between text-xs text-shift-Muted mb-2 font-mono tracking-widest uppercase">
              <span>Price (ETH)</span>

              <Lock size={12} className="text-shift-Muted" />
            </label>

            <input
              type="text"
              value={mintPrice}
              readOnly
              disabled
              className="w-full bg-shift-input border border-shift-border rounded-lg p-3 font-mono text-sm "
            />
          </div>

          <div>
            <label className="block tracking-widest text-xs text-shift-Muted mb-2 font-mono uppercase">Quantity</label>

            <input
              type="number"
              min={1}
              value={maxQuantity || ""}
              onChange={(e) => setMaxQuantity(Number(e.target.value))}
              disabled={isArmed}
              className="w-full bg-shift-input border border-shift-border rounded-lg p-3 font-mono text-sm focus:outline-none focus:border-shift-lime"
            />
          </div>

          <div>
            <label className="flex items-center tracking-widest justify-between text-xs text-shift-Muted mb-2 font-mono uppercase">
              <span>Function</span>

              <Lock size={12} className="text-slate-500" />
            </label>

            <input
              type="text"
              value={functionName}
              readOnly
              disabled
              className="w-full bg-shift-input border border-shift-border rounded-lg p-3 font-mono text-sm"
            />
          </div>
        </div>
      </div>

      <div className="bg-shift-accent border border-shift-border rounded-xl p-4 mb-6 text-xs text-shift-Muted font-mono">
        <div className="font-bold text-shift-lime tracking-widest mb-2">AUTOMATIC GAS MANAGEMENT</div>
        <p>Gas limit and current network fees are estimated automatically at mint time.</p>
        <p className="mt-1">A chain-specific safety ceiling prevents unexpectedly expensive broadcasts.</p>
      </div>

      <button
        type="button"
        onClick={onToggleArm}
        disabled={loading}
        className={`w-full text-slate-900 text-lg cursor-pointer py-4 rounded-lg tracking-wider flex items-center justify-center gap-3 transition-all border border-cyan-500/40 bg-shift-cyan hover:bg-cyan-600  ${loading ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <Play fill="currentColor" size={24} />

        {loading ? "PROCESSING..." : "ARM BURNER"}
      </button>
    </div>
  );
}
