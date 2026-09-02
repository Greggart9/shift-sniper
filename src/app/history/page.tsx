"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CheckCircle2, Clock3, Shield, XCircle, ExternalLink, History as HistoryIcon } from "lucide-react";

import LandingPage from "@/components/LandingPage";
import Sidebar from "@/components/Sidebar";
import { DEFAULT_CHAIN_ID, getChainConfig, SUPPORTED_CHAINS } from "@/lib/chains";

interface TradeLog {
  id: string;
  timestamp: string;
  targetContract: string;
  mode: "BURNER";
  status: "SUCCESS" | "FAILED";
  txHash?: string;
  errorMessage?: string;
}

const MAX_HISTORY_ITEMS = 5;

export default function HistoryPage() {
  const { isConnected, address } = useAccount();
  const connectedChainId = useChainId();
  const chainId = SUPPORTED_CHAINS.some((chain) => chain.id === connectedChainId)
    ? connectedChainId
    : DEFAULT_CHAIN_ID;
  const chainLabel = getChainConfig(chainId).label;
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "0x358...Fb0";

  const [logs, setLogs] = useState<TradeLog[]>([]);
  const [loading, setLoading] = useState(false);

  const recentLogs = useMemo(
    () => [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, MAX_HISTORY_ITEMS),
    [logs],
  );

  const fetchHistory = useCallback(async () => {
    setLogs([]);
    setLoading(true);
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error ?? "Failed to retrieve execution history.");

      const trimmed = Array.isArray(data.history) ? data.history.slice(0, MAX_HISTORY_ITEMS) : [];
      setLogs(trimmed);
    } catch (error) {
      console.error("Failed to fetch history:", error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !address) {
      const clearTimer = window.setTimeout(() => setLogs([]), 0);
      return () => window.clearTimeout(clearTimer);
    }

    const timer = window.setTimeout(() => void fetchHistory(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchHistory, isConnected, address]);

  useEffect(() => {
    const handleAuthenticated = (event: Event) => {
      if ((event as CustomEvent<string>).detail === address?.toLowerCase()) void fetchHistory();
    };
    window.addEventListener("wallet-authenticated", handleAuthenticated);
    return () => window.removeEventListener("wallet-authenticated", handleAuthenticated);
  }, [address, fetchHistory]);

  if (!isConnected) return <LandingPage />;

  return (
    <div className="h-screen w-screen text-shift-text flex overflow-hidden">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b bg-shift-bg border-shift-border px-8 py-4 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-shift-icon bg-slate-900 text-shift-icon">
                <HistoryIcon size={18} />
              </div>

              <div>
                <h1 className="text-xl leading-none font-bold tracking-[0.04em]">Execution History</h1>
                <p className="mt-2 text-sm text-shift-Muted">Track all completed mint operations</p>
              </div>
            </div> 
           
            <div className="flex items-center gap-3">
              
              <ConnectButton showBalance={false} />
              {/* <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]">
                <span className="h-2.5 w-2.5 rounded-full bg-shift-lime shadow-[0_0_12px_rgba(197,224,0,0.8)]" />
                <span>{chainLabel}</span>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-sm text-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]">
                <span className="h-2.5 w-2.5 rounded-full border border-slate-500 bg-slate-200" />
                <span>{shortAddress}</span>
              </div> */}

            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-375 p-8">
            {loading ? (
              <div className="rounded-xl border border-shift-border bg-shift-card px-6 py-12 text-center text-shift-Muted">
                Loading history...
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="rounded-xl border border-shift-border bg-shift-card px-6 py-12 text-center text-shift-Muted">
                No execution history yet.
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {recentLogs.map((log) => {
                    const isSuccess = log.status === "SUCCESS";
                    const time = new Date(log.timestamp);
                    const formatted = `${time.toLocaleDateString("en-GB")} · ${time.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    })}`;

                    return (
                      <div
                        key={log.id}
                        className={`rounded-xl border bg-shift-surface p-3 ${
                          isSuccess
                            ? "border-green-500 bg-shift-surface"
                            : "border-red-500 bg-shift-surface"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-shift-border bg-shift-bg">
                            {isSuccess ? (
                              <CheckCircle2 size={15} className="text-green-500" />
                            ) : (
                              <XCircle size={15} className="text-red-500" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono text-shift-textMuted">{formatted}</span>
                              <span
                                className={`text-[11px] font-bold uppercase tracking-[0.16em] ${
                                  isSuccess ? "text-green-500" : "text-red-500"
                                }`}
                              >
                                {log.status}
                              </span>
                            </div>

                            <div className="mt-1 flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="font-mono text-[15px] text-white break-all">{log.targetContract}</div>
                                {log.errorMessage && (
                                  <div className="mt-1 text-sm text-red-500">{log.errorMessage}</div>
                                )}
                              </div>

                              {log.txHash && (
                                <a
                                  href={`https://robinhood.explorer.com/tx/${log.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex shrink-0 items-center gap-2 rounded-md border border-shift-border bg-transparent px-3 py-2 text-[11px] uppercase tracking-[0.12em]"
                                >
                                  View TX
                                  <ExternalLink size={14} />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-shift-border pt-4 text-[12px] ">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-[9px] text-slate-300">
                      <Clock3 className="text-shift-icon" size={9} />
                    </span>
                    <span>All times are shown in your local timezone</span>
                  </div>

                  <div className="flex items-center gap-2 ">
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-slate-600 text-[9px]">
                      <Shield className="text-shift-icon" size={9} />
                    </span>
                    <span>Only the latest {MAX_HISTORY_ITEMS} executions are shown</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
