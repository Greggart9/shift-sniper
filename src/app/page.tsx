'use client';

import { useState } from 'react';
import { useAccount, useSignTransaction } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { encodeFunctionData, parseEther } from 'viem';
import { toast } from 'sonner';

import LandingPage from '@/components/LandingPage';
import Sidebar from '@/components/Sidebar';
import SniperConfig from '@/components/SniperConfig';
import ActiveSnipesList from '@/components/ActiveSnipesList';
import LiveTerminal from '@/components/LiveTerminal';

export default function Home() {
  const { isConnected } = useAccount();
  const { signTransactionAsync } = useSignTransaction();

  const [mode, setMode] = useState<'BURNER' | 'PRESIGN'>('BURNER');
  const [targetContract, setTargetContract] = useState('0x1234...abcd5678ef9012');
  const [mintPrice, setMintPrice] = useState('0.05');
  const [maxQuantity, setMaxQuantity] = useState(5);
  const [functionName, setFunctionName] = useState('mint');
  
  const [loading, setLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Triggers active task list refresh
  
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] System initialized.`,
    `[${new Date().toLocaleTimeString()}] Connected to Robinhood Chain L2.`
  ]);

  const addLog = (msg: string) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleArmSniper = async () => {
    if (!isConnected) return;
    setLoading(true);

    try {
      let payloadParams: any = { targetContract, mintPriceEth: mintPrice, maxQuantity, functionName, mode };

      if (mode === 'BURNER') {
        const savedWalletsRaw = localStorage.getItem('shift_burner_wallets');
        const activeId = localStorage.getItem('shift_active_burner_id');
        let activePrivateKey: string | null = null;

        if (savedWalletsRaw) {
          const wallets = JSON.parse(savedWalletsRaw);
          const activeWallet = wallets.find((w: any) => w.id === activeId) || wallets[0];
          if (activeWallet) activePrivateKey = activeWallet.privateKey;
        }

        if (!activePrivateKey) {
          addLog('❌ ERROR: No active burner wallet selected!');
          setLoading(false);
          return;
        }
        payloadParams.burnerPrivateKey = activePrivateKey;

      } else if (mode === 'PRESIGN') {
        addLog('🟡 Prompting wallet for signature...');
        
        try {
          const data = encodeFunctionData({
            abi: [{
              name: functionName,
              type: 'function',
              stateMutability: 'payable',
              inputs: [{ name: 'quantity', type: 'uint256' }],
              outputs: []
            }],
            functionName: functionName,
            args: [BigInt(maxQuantity)],
          });

          const signedTx = await signTransactionAsync({
            to: targetContract as `0x${string}`,
            value: parseEther(mintPrice),
            data,
            gas: 300000n,
          });

          addLog('✅ Transaction signed successfully!');
          payloadParams.signedPayload = signedTx; 
          
        } catch (signError: any) {
          addLog(`❌ Signature rejected: ${signError.shortMessage || 'User denied request.'}`);
          setLoading(false);
          return;
        }
      }

      // POST to create a new task
      const response = await fetch('/api/sniper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadParams),
      });
      const data = await response.json();

      if (data.success) {
        addLog(`🎯 SNIPER TASK ARMED: [ID: ${data.taskId.slice(0, 8)}...] Target: ${targetContract} [Mode: ${mode}]`);
        setRefreshTrigger((prev) => prev + 1); // Refresh the active list table
      } else {
        addLog(`❌ API Error: ${data.error}`);
      }
    } catch (err) {
      addLog(`❌ Network Error: Could not reach sniper engine.`);
    } finally {
      setLoading(false);
    }
    toast.success('Sniper task armed and queued successfully!')
  };

  if (!isConnected) {
    return <LandingPage />;
  }

  return (
    <div className="min-h-screen bg-shift-navy text-shift-textMain flex font-sans">
      <Sidebar />

      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8 gap-4">
          <ConnectButton showBalance={false} />

          <div className="bg-shift-card border border-slate-700 px-6 py-3 rounded-lg flex items-center justify-between min-w-[220px]">
            <span className="text-shift-textMuted">Robinhood L2 Gas</span>
            <span className="font-mono text-shift-lime">12.4 Gwei</span>
          </div>
        </header>

        {/* 1. Configuration Card */}
        <SniperConfig
          targetContract={targetContract}
          setTargetContract={setTargetContract}
          mintPrice={mintPrice}
          setMintPrice={setMintPrice}
          maxQuantity={maxQuantity}
          setMaxQuantity={setMaxQuantity}
          functionName={functionName}
          setFunctionName={setFunctionName}
          mode={mode}
          setMode={setMode}
          isArmed={false} // Multi-task means config is never globally locked down
          loading={loading}
          onToggleArm={handleArmSniper}
        />

        {/* 2. Active Snipes Table */}
        <ActiveSnipesList 
          refreshTrigger={refreshTrigger} 
          onTaskDisarmed={() => addLog('🛑 Snipe task disarmed by user.')} 
          
        />

        {/* 3. Live Terminal Log */}
        <LiveTerminal logs={logs} />
      </main>
    </div>
  );
}