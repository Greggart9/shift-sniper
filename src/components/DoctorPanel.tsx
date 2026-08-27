'use client';

import { useState } from 'react';
import { formatEther } from 'viem';
import { publicClient } from '@/lib/viem';

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

const MIN_BALANCE_WEI = 1_000_000_000_000_000n; // 0.01 ETH heuristic floor

export default function DoctorPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CheckResult[]>([]);

  const runDiagnostics = async () => {
    setLoading(true);
    setOpen(true);
    const checks: CheckResult[] = [];

    try {
      const res = await fetch('/api/doctor');
      const data = await res.json();
      checks.push(...(data.checks ?? []));
    } catch {
      checks.push({ name: 'Server diagnostics', status: 'FAIL', detail: 'Could not reach /api/doctor.' });
    }

    const savedWalletsRaw = localStorage.getItem('shift_burner_wallets');
    const activeId = localStorage.getItem('shift_active_burner_id');
    const wallets: { id: string; address: `0x${string}`; privateKey: `0x${string}` }[] = savedWalletsRaw
      ? JSON.parse(savedWalletsRaw)
      : [];

    if (wallets.length === 0) {
      checks.push({ name: 'Burner wallets', status: 'FAIL', detail: 'No burner wallets saved. Generate or import one before arming.' });
    } else {
      checks.push({ name: 'Burner wallets', status: 'PASS', detail: `${wallets.length} wallet(s) saved.` });

      const activeWallet = wallets.find((w) => w.id === activeId) ?? wallets[0];
      checks.push({
        name: 'Active wallet target',
        status: wallets.find((w) => w.id === activeId) ? 'PASS' : 'WARN',
        detail: wallets.find((w) => w.id === activeId)
          ? activeWallet.address
          : `No wallet explicitly marked active — ${activeWallet.address} (first saved) will be used by default.`,
      });

      try {
        const balance = await publicClient.getBalance({ address: activeWallet.address });
        checks.push({
          name: 'Active wallet balance',
          status: balance >= MIN_BALANCE_WEI ? 'PASS' : 'WARN',
          detail: `${formatEther(balance)} ETH${balance < MIN_BALANCE_WEI ? ' — may not cover mint price plus the top fee-bump tier\'s gas.' : ''}`,
        });
      } catch {
        checks.push({ name: 'Active wallet balance', status: 'FAIL', detail: 'Could not fetch balance from RPC.' });
      }
    }

    setResults(checks);
    setLoading(false);
  };

  const statusColor = (status: CheckResult['status']) =>
    status === 'PASS' ? 'text-shift-lime' : status === 'WARN' ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="bg-shift-card border border-slate-700 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-shift-textMain">Pre-Flight Diagnostics</h3>
        <button
          onClick={runDiagnostics}
          disabled={loading}
          className="bg-shift-lime text-shift-navy px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Doctor'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-2">
          {results.map((check, i) => (
            <div key={i} className="flex items-start gap-3 text-sm font-mono border-t border-slate-800 pt-2">
              <span className={`${statusColor(check.status)} font-bold w-12 shrink-0`}>{check.status}</span>
              <div>
                <span className="text-shift-textMain">{check.name}</span>
                <div className="text-shift-textMuted">{check.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}