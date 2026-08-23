'use client';

import { Terminal } from 'lucide-react';

interface LiveTerminalProps {
  logs: string[];
}

export default function LiveTerminal({ logs }: LiveTerminalProps) {
  return (
    <div className="bg-black border border-slate-700 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs">
      <div className="text-shift-textMuted flex items-center justify-between mb-2 border-b border-slate-800 pb-2">
        <span className="text-shift-lime flex items-center gap-2">
          <Terminal size={14} /> LIVE ENGINE TERMINAL
        </span>
      </div>
      <div className="text-green-500/90 space-y-1">
        {logs.map((log, idx) => (
          <p key={idx}>{log}</p>
        ))}
      </div>
    </div>
  );
}