"use client";

import { ShieldAlert, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export default function SniperInstructions() {
  return (
    <div className="bg-shift-card border border-slate-700 rounded-xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-4 text-shift-lime">
        <ShieldAlert size={20} />
        <h2 className="text-base font-bold tracking-wide">OPERATIONAL GUIDELINES & SAFETY RULES</h2>
      </div>

      <p className="text-xs text-shift-textMuted mb-6">
        Read carefully before executing trades. Shift operates via self-custodial architecture to protect your main
        vault.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-emerald-950/10 border border-emerald-900/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
            <CheckCircle size={16} /> What You Should Do
          </div>
          <ul className="space-y-2 text-xs text-shift-textMuted">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">•</span>
              <span>
                <strong>Export & Backup Private Keys:</strong> Burners are stored locally in your browser. If you clear
                cache or switch browsers, they will be lost.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">•</span>
              <span>
                <strong>Fund Only What You Need:</strong> Only send enough ETH to your burner to cover the mint price
                and gas for your specific target.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 font-bold">•</span>
              <span>
                <strong>Use Pre-Sign for WLs:</strong> Use the Pre-Sign mode when your main wallet holds the Whitelist
                spot to avoid contract rejection.
              </span>
            </li>
          </ul>
        </div>

        <div className="bg-red-950/10 border border-red-900/30 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-wider">
            <XCircle size={16} /> What NOT To Do
          </div>
          <ul className="space-y-2 text-xs text-shift-textMuted">
            <li className="flex items-start gap-2">
              <span className="text-red-400 font-bold">•</span>
              <span>
                <strong>Do Not Use as a Vault:</strong> Never store large amounts of long-term ETH or valuable NFTs in a
                burner wallet address.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 font-bold">•</span>
              <span>
                <strong>Do Not Share Private Keys:</strong> Shift staff will never ask for your burner private keys or
                seed phrases. Keep them private.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-red-400 font-bold">•</span>
              <span>
                <strong>Do Not Refresh During Pre-Sign:</strong> Avoid closing your browser tab while a pre-signed
                transaction payload is armed and waiting in memory.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
