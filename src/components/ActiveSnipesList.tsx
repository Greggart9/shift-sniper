"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, Trash2, RefreshCw, Zap, ShieldCheck, ExternalLink, Clock3, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getChainConfig } from "@/lib/chains";

interface ActiveTask {
  id: string;
  chainId?: number;
  chainName?: string;
  targetContract: string;
  mintPriceEth: string;
  maxQuantity: number;
  targetFunctionName: string;
  executionMode: "BURNER";
  status:
    | "ARMED"
    | "WAITING"
    | "SCHEDULED"
    | "READY"
    | "BROADCASTING"
    | "CONFIRMED"
    | "FAILED"
    | "EXPIRED"
    | "CANCELLED";
  statusMessage?: string;
  scheduledFor?: string;
  endsAt?: string;
  signerAddress?: string;
  currentTier?: number;
  broadcastTxHashes?: string[];
}

interface ActiveSnipesListProps {
  refreshTrigger: number; // Used to trigger re-fetches when a new task is armed
  onTaskDisarmed: () => void;
  maxTasks?: number; // Maximum number of tasks to display (default: unlimited)
}

export default function ActiveSnipesList({ refreshTrigger, onTaskDisarmed, maxTasks }: ActiveSnipesListProps) {
  const [tasks, setTasks] = useState<ActiveTask[]>([]);
  const [loading, setLoading] = useState(false);

  const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

  const isTaskActive = (task: ActiveTask): boolean => {
    // Keep all active/in-progress statuses
    const activeStatuses = ["ARMED", "WAITING", "SCHEDULED", "READY", "BROADCASTING"];
    if (activeStatuses.includes(task.status)) {
      return true;
    }

    // For CONFIRMED and FAILED, keep only if recent (within 5 hours)
    if (task.status === "CONFIRMED" || task.status === "FAILED") {
      const taskTime = new Date(task.endsAt || task.scheduledFor || new Date()).getTime();
      const now = new Date().getTime();
      return now - taskTime < FIVE_HOURS_MS;
    }

    // Remove EXPIRED and CANCELLED
    return false;
  };

  const filteredTasks = tasks.filter(isTaskActive);
  const displayedTasks = maxTasks ? filteredTasks.slice(0, maxTasks) : filteredTasks;
  const hiddenTasksCount = filteredTasks.length - displayedTasks.length;

  const formatSchedule = (scheduledFor?: string) => {
    if (!scheduledFor) return "Ready now";
    return `Launch ${new Date(scheduledFor).toLocaleTimeString()}`;
  };

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sniper");
      const data = await res.json();
      if (data.success) {
        setTasks(Array.isArray(data.statuses) ? data.statuses : data.tasks);
      }
    } catch (err) {
      console.error("Failed to fetch active tasks:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialFetch = setTimeout(() => void fetchTasks(), 0);
    const interval = setInterval(fetchTasks, 5000); // Poll every 5 seconds
    return () => {
      clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchTasks, refreshTrigger]);

  const handleDisarm = async (taskId: string) => {
    try {
      const res = await fetch(`/api/sniper?taskId=${taskId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        fetchTasks();
        onTaskDisarmed();
        toast.warning("Sniper task disarmed.");
      }
    } catch (err) {
      console.error("Failed to disarm task:", err);
    }
  };

  const handleRetry = async (taskId: string) => {
    try {
      const res = await fetch("/api/sniper", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Could not retry task.");
        return;
      }
      await fetchTasks();
      toast.success("Retry task armed. Wallet freshness will be checked before broadcast.");
    } catch {
      toast.error("Could not reach the sniper engine.");
    }
  };

  return (
    <div className="border border-shift-border bg-shift-surface rounded-xl p-6 mb-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold flex items-center gap-2 text-shift-head">
            <Activity size={16} className="text-shift-icon" /> ACTIVE SNIPING TASKS ({filteredTasks.length})
          </h2>
          {hiddenTasksCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs font-semibold text-amber-400">
              +{hiddenTasksCount} more on full page
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/50 border border-slate-600/50 px-2.5 py-1 text-xs text-shift-textMuted">
            Clears after 5 hours
          </span>
        </div>
        <button
          onClick={fetchTasks}
          className="p-2 bg-shift-bg border border-shift-border rounded-lg text-shift-textMuted hover:text-white transition-colors"
          title="Refresh List"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-shift-lime" : ""} />
        </button>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm tracking-wider border border-dashed border-slate-800 rounded-lg">
          No active sniper tasks running. Configure a target above and arm your bot.
        </div>
      ) : (
        <div className="space-y-3">
          {displayedTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between bg-shift-accent border border-shift-border p-4 rounded-lg font-mono text-xs"
            >
              <div className="flex items-center gap-4">
                <span 
                  className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 ${
                    task.executionMode === "BURNER"
                      ? "bg-shift-lime/10 text-shift-lime border border-shift-lime/20"
                      : "bg-shift-cyan/10 text-shift-cyan border border-shift-cyan/20"
                  }`}
                >
                  {task.executionMode === "BURNER" ? <Zap size={12} /> : <ShieldCheck size={12} />}
                  {task.executionMode}
                </span>

                <div>
                  <div className="text-white font-bold">
                    {task.targetContract} · {task.chainName ?? (task.chainId ? getChainConfig(task.chainId).label : "Robinhood Chain")}
                  </div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    Fn: <span className="text-shift-lime">{task.targetFunctionName}</span> | Price:{" "}
                    <span className="text-white">{task.mintPriceEth} ETH</span> | Qty:{" "}
                    <span className="text-white">{task.maxQuantity}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] mt-2">
                    <span className={task.status === "BROADCASTING" ? "text-amber-400" : "text-shift-cyan"}>
                      {task.status}
                      {task.currentTier !== undefined ? ` · tier ${task.currentTier + 1}` : ""}
                    </span>
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Clock3 size={12} /> {formatSchedule(task.scheduledFor)}
                    </span>
                    {task.endsAt && <span className="text-slate-500">Ends {new Date(task.endsAt).toLocaleTimeString()}</span>}
                    {task.signerAddress && (
                      <span className="text-slate-500" title={task.signerAddress}>
                        Wallet {task.signerAddress.slice(0, 6)}...{task.signerAddress.slice(-4)}
                      </span>
                    )}
                    {task.broadcastTxHashes?.map((hash) => (
                      <a
                        key={hash}
                        href={`https://explorer.testnet.chain.robinhood.com/tx/${hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-shift-lime hover:underline"
                        title={hash}
                      >
                        TX <ExternalLink size={11} />
                      </a>
                    ))}
                  </div>
                  {task.statusMessage && <div className="text-slate-500 text-[11px] mt-1">{task.statusMessage}</div>}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {task.status === "FAILED" && (
                  <button
                    onClick={() => void handleRetry(task.id)}
                    className="flex items-center gap-1 bg-amber-950/40 border border-amber-900/50 hover:bg-amber-900/50 text-amber-400 px-3 py-1.5 rounded-md transition-colors"
                  >
                    <RotateCcw size={14}  /> Retry
                  </button>
                )}
                  {!["FAILED", "CONFIRMED", "EXPIRED", "CANCELLED"].includes(task.status) && (
                  <button
                    onClick={() => void handleDisarm(task.id)}
                    className="flex items-center gap-1 bg-red-950/40 border border-red-900/50 hover:bg-red-900/50 text-red-400 px-3 py-1.5 rounded-md transition-colors"
                  >
                    <Trash2 size={14} /> Disarm
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
