'use client';

import { Play, Square, Zap, ShieldCheck } from 'lucide-react';

interface SniperConfigProps {
  targetContract: string;
  setTargetContract: (val: string) => void;
  mintPrice: string;
  setMintPrice: (val: string) => void;
  maxQuantity: number;
  setMaxQuantity: (val: number) => void;
  functionName: string;
  setFunctionName: (val: string) => void;
  mode: 'BURNER' | 'PRESIGN';
  setMode: (val: 'BURNER' | 'PRESIGN') => void;
  isArmed: boolean;
  loading: boolean;
  onToggleArm: () => void;
}

export default function SniperConfig({
  targetContract,
  setTargetContract,
  mintPrice,
  setMintPrice,
  maxQuantity,
  setMaxQuantity,
  functionName,
  setFunctionName,
  mode,
  setMode,
  isArmed,
  loading,
  onToggleArm,
}: SniperConfigProps) {
  return (
    <div className="bg-shift-card border border-slate-700 rounded-xl p-6 mb-6 relative overflow-hidden">
      {isArmed && (
        <div className="absolute inset-0 z-10 bg-shift-navy/50 backdrop-blur-[1px] pointer-events-none" />
      )}

      <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
        <span className="text-shift-lime">🎯</span> SNIPER CONFIGURATION
      </h2>

      {/* Dual-Mode Selector */}
      <div className="mb-8">
        <label className="block text-sm text-shift-textMuted mb-3">Execution Mode</label>
        <div className="flex bg-slate-900 border border-slate-700 rounded-xl p-1 relative z-20">
          <button
            onClick={() => setMode('BURNER')}
            disabled={isArmed}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${
              mode === 'BURNER' 
                ? 'bg-shift-lime text-shift-navy shadow-sm' 
                : 'text-shift-textMuted hover:text-white'
            }`}
          >
            <Zap size={16} /> PUBLIC / FCFS (Burner)
          </button>
          <button
            onClick={() => setMode('PRESIGN')}
            disabled={isArmed}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${
              mode === 'PRESIGN' 
                ? 'bg-shift-cyan text-shift-navy shadow-sm' 
                : 'text-shift-textMuted hover:text-white'
            }`}
          >
            <ShieldCheck size={16} /> WL PHASE (Pre-Sign)
          </button>
        </div>
      </div>

      <div className="space-y-4 mb-8">
        <div>
          <label className="block text-sm text-shift-textMuted mb-2">Target Contract Address</label>
          <input
            type="text"
            value={targetContract}
            onChange={(e) => setTargetContract(e.target.value)}
            disabled={isArmed}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm focus:outline-none focus:border-shift-lime transition-colors disabled:opacity-50"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-shift-textMuted mb-2">Mint Price (ETH)</label>
            <input
              type="text"
              value={mintPrice}
              onChange={(e) => setMintPrice(e.target.value)}
              disabled={isArmed}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm focus:outline-none focus:border-shift-lime disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm text-shift-textMuted mb-2">Max Quantity</label>
            <input
              type="number"
              value={maxQuantity}
              onChange={(e) => setMaxQuantity(Number(e.target.value))}
              disabled={isArmed}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm focus:outline-none focus:border-shift-lime disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm text-shift-textMuted mb-2">Function Name</label>
            <input
              type="text"
              value={functionName}
              onChange={(e) => setFunctionName(e.target.value)}
              disabled={isArmed}
              placeholder="e.g. mint, claim"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm focus:outline-none focus:border-shift-lime disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      <button
        onClick={onToggleArm}
        disabled={loading}
        className={`relative z-20 w-full font-black text-xl py-4 rounded-lg flex items-center justify-center gap-3 transition-all ${
          isArmed
            ? 'bg-red-500 hover:bg-red-600 text-white shadow-[0_0_20px_rgba(239,68,68,0.3)]'
            : mode === 'PRESIGN'
            ? 'bg-shift-cyan hover:bg-[#22a6e0] text-shift-navy shadow-[0_0_20px_rgba(56,189,248,0.2)]'
            : 'bg-shift-lime hover:bg-shift-limeHover text-shift-navy shadow-[0_0_20px_rgba(197,224,0,0.2)]'
        }`}
      >
        {loading ? (
          'PROCESSING...'
        ) : isArmed ? (
          <>
            <Square fill="currentColor" size={24} /> DISARM SNIPER
          </>
        ) : (
          <>
            <Play fill="currentColor" size={24} /> {mode === 'PRESIGN' ? 'SIGN & ARM SNIPER' : 'ARM BURNER'}
          </>
        )}
      </button>
    </div>
  );
}