"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CheckCircle2, Clock3, RefreshCw, XCircle } from "lucide-react";

import LandingPage from "@/components/LandingPage";
import Sidebar from "@/components/Sidebar";

interface TradeLog {
  id: string;
  timestamp: string;
  targetContract: string;
  mode: "BURNER" | "PRESIGN";
  status: "SUCCESS" | "FAILED";
  txHash?: string;
  errorMessage?: string;
}

export default function HistoryPage() {
  const { isConnected } = useAccount();
  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error ?? "Failed to retrieve execution history.");
      setLogs(data.history);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isConnected) return;

    const timer = window.setTimeout(() => void fetchHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchHistory, isConnected]);

  if (!isConnected) return <LandingPage />;

  return (
    <div className="min-h-screen bg-shift-navy text-shift-textMain flex font-sans">
      <Sidebar />
      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto">
        <header className="flex justify-end items-center mb-8">
          <ConnectButton showBalance={false} />
        </header>
        <section className="bg-shift-card border border-slate-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2 text-white">
              <Clock3 className="text-shift-cyan" /> EXECUTION LOGS
            </h2>
            <button
              type="button"
              onClick={() => void fetchHistory()}
              disabled={loading}
              aria-label="Refresh execution logs"
              className="p-2 bg-slate-900 border border-slate-700 rounded-lg text-shift-textMuted hover:text-white disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              <RefreshCw size={16} className={loading ? "animate-spin text-shift-cyan" : ""} />
            </button>
          </div>
          {logs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-800 rounded-lg">
              No sniper executions recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={`${log.id}-${log.timestamp}`}
                  className={`border p-4 rounded-lg flex items-center justify-between gap-4 transition-colors ${log.status === "SUCCESS" ? "bg-emerald-950/10 border-emerald-900/30 hover:border-emerald-900/60" : "bg-red-950/10 border-red-900/30 hover:border-red-900/60"}`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {log.status === "SUCCESS" ? (
                      <CheckCircle2 className="text-emerald-400 shrink-0" size={24} />
                    ) : (
                      <XCircle className="text-red-400 shrink-0" size={24} />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-white font-mono text-sm truncate">{log.targetContract}</span>
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded uppercase font-bold">
                          {log.mode}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                        {log.errorMessage && <span className="text-red-400 ml-2">| Error: {log.errorMessage}</span>}
                      </div>
                    </div>
                  </div>
                  {log.txHash && (
                    <span
                      title={log.txHash}
                      className="max-w-56 truncate text-xs font-mono text-emerald-300 bg-slate-900 px-3 py-2 rounded-lg border border-slate-700"
                    >
                      {log.txHash}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
