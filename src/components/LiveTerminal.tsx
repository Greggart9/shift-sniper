"use client";

import { useEffect, useRef } from "react";
import { Terminal, CheckCircle2, XCircle, Radio, Zap } from "lucide-react";

interface LiveTerminalProps {
  logs: string[];
}

export default function LiveTerminal({ logs }: LiveTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);

  // Always keep the terminal scrolled to the newest message.
  useEffect(() => {
    if (!terminalRef.current) return;

    terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [logs]);

  // Give important terminal messages slightly different visual treatment.
  const getLogType = (log: string) => {
    if (log.includes("MINT SUCCESS") || log.includes("minted successfully") || log.includes("✅")) {
      return "success";
    }

    if (log.includes("ERROR") || log.includes("FAILED") || log.includes("❌")) {
      return "error";
    }

    if (log.includes("broadcast") || log.includes("BROADCAST") || log.includes("🔗")) {
      return "broadcast";
    }

    if (log.includes("SNIPER TASK") || log.includes("armed") || log.includes("ARMED") || log.includes("🎯")) {
      return "armed";
    }

    return "normal";
  };

  const renderIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle2 size={13} className="shrink-0" />;

      case "error":
        return <XCircle size={13} className="shrink-0" />;

      case "broadcast":
        return <Radio size={13} className="shrink-0" />;

      case "armed":
        return <Zap size={13} className="shrink-0" />;

      default:
        return null;
    }
  };

  const getTextClass = (type: string) => {
    switch (type) {
      case "success":
        return "text-green-400";

      case "error":
        return "text-red-400";

      case "broadcast":
        return "text-yellow-400";

      case "armed":
        return "text-cyan-400";

      default:
        return "text-green-500/90";
    }
  };

  return (
    <div className="bg-black border border-shift-border rounded-xl overflow-hidden font-mono text-xs">
      <div className="text-shift-Muted flex items-center justify-between px-4 py-3 border-b border-shift-border bg-black/80">
        <span className="text-shift-head flex items-center gap-2">
          <Terminal size={14} />

          <span>LIVE ENGINE TERMINAL</span>
        </span>

        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />

            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>

          <span className="text-[10px] uppercase tracking-wider text-green-500">Live</span>
        </div>
      </div>

      <div
        ref={terminalRef}
        className="h-72 overflow-y-auto p-4 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
      >
        {logs.length === 0 ? (
          <p className="text-slate-600">Waiting for sniper activity...</p>
        ) : (
          logs.map((log, idx) => {
            const type = getLogType(log);

            return (
              <div key={`${idx}-${log}`} className={`flex items-start gap-2 leading-relaxed ${getTextClass(type)}`}>
                {renderIcon(type)}

                <p className="break-all">{log}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
