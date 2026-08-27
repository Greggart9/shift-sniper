'use client';

import { useState, useEffect } from 'react';
import { useAccount, useSignTransaction } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { encodeFunctionData, parseEther } from 'viem';
import { toast } from 'sonner';

import LandingPage from '@/components/LandingPage';
import DoctorPanel from '@/components/DoctorPanel';
import Sidebar from '@/components/Sidebar';
import SniperConfig from '@/components/SniperConfig';
import ActiveSnipesList from '@/components/ActiveSnipesList';
import LiveTerminal from '@/components/LiveTerminal';
import { signBurnerSnipeFeeTiers } from '@/lib/signBurnerTx';

export default function Home() {
  const { isConnected } = useAccount();
  const { signTransactionAsync } = useSignTransaction();

  const [mode, setMode] = useState<'BURNER' | 'PRESIGN'>('BURNER');
  const [targetContract, setTargetContract] = useState('');
  const [mintPrice, setMintPrice] = useState('0');
  const [maxQuantity, setMaxQuantity] = useState(0);
  const [functionName, setFunctionName] = useState('');

  const [useAllWallets, setUseAllWallets] = useState(false);
  const [savedWalletCount, setSavedWalletCount] = useState(0);

  useEffect(() => {
    const savedWalletsRaw = localStorage.getItem('shift_burner_wallets');
    const wallets = savedWalletsRaw ? JSON.parse(savedWalletsRaw) : [];
    setSavedWalletCount(wallets.length);
  }, []);
  
  const [loading, setLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Triggers active task list refresh
  
  const [logs, setLogs] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] System initialized.`,
    `[${new Date().toLocaleTimeString()}] Connected to Robinhood Chain L2.`
  ]);

  const [maxFeeGwei, setMaxFeeGwei] = useState('25');
  const [priorityTipGwei, setPriorityTipGwei] = useState('5');

  const addLog = (msg: string) => setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const handleArmSniper = async () => {
    if (!isConnected) return;
    setLoading(true);

    try {
      const payloadParams: Record<string, unknown> = {
        targetContract,
        mintPriceEth: mintPrice,
        maxQuantity,
        functionName,
        mode,
        maxFeeGwei,
        priorityTipGwei,
      };

    if (mode === 'BURNER') {
        const savedWalletsRaw = localStorage.getItem('shift_burner_wallets');
        const activeId = localStorage.getItem('shift_active_burner_id');

        if (!savedWalletsRaw) {
          addLog('❌ ERROR: No burner wallets saved!');
          setLoading(false);
          return;
        }

        const wallets: { id: string; privateKey: `0x${string}` }[] = JSON.parse(savedWalletsRaw);
        if (wallets.length === 0) {
          addLog('❌ ERROR: No burner wallets saved!');
          setLoading(false);
          return;
        }

        const walletsToSign = useAllWallets
          ? wallets
          : [wallets.find((w) => w.id === activeId) ?? wallets[0]];

        addLog(
          useAllWallets
            ? `🟡 Signing fee-bump ladders for ${walletsToSign.length} wallet(s) locally... keys never leave the browser.`
            : '🟡 Signing fee-bump ladder locally... key never leaves the browser.'
        );

        try {
          const signedResults = await Promise.all(
            walletsToSign.map((wallet) =>
              signBurnerSnipeFeeTiers({
                privateKey: wallet.privateKey,
                targetContract: targetContract as `0x${string}`,
                quantity: maxQuantity,
                fallbackPriceEth: mintPrice,
                functionName,
                maxFeeGwei,
                priorityTipGwei,
              })
            )
          );
          payloadParams.feeTiersBatch = signedResults.map((r) => r.feeTiers);
          addLog(`✅ Signed ${signedResults.length} wallet(s), ${signedResults[0]?.feeTiers.length ?? 0} fee tier(s) each.`);
        } catch (signError: any) {
          addLog(`❌ Local signing failed: ${signError.message ?? 'Unknown error'}`);
          setLoading(false);
          return;
        }

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
          payloadParams.feeTiersBatch = [[signedTx]];
          
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
        const taskCount = data.taskIds?.length ?? 1;
        addLog(`🎯 ${taskCount} SNIPER TASK${taskCount === 1 ? '' : 'S'} ARMED: Target: ${targetContract} [Mode: ${mode}]`);
        setRefreshTrigger((prev) => prev + 1); // Refresh the active list table
      } else {
        addLog(`❌ API Error: ${data.error}`);
      }
    } catch (err) {
      addLog(`❌ Network Error: Could not reach sniper engine.`);
    } finally {
      setLoading(false);
    }
    toast.success('Sniper task armed and queued successfully!');
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

        <DoctorPanel />

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
          maxFeeGwei={maxFeeGwei}
          setMaxFeeGwei={setMaxFeeGwei}
          priorityTipGwei={priorityTipGwei}
          setPriorityTipGwei={setPriorityTipGwei}
          mode={mode}
          setMode={setMode}
          useAllWallets={useAllWallets}
          setUseAllWallets={setUseAllWallets}
          savedWalletCount={savedWalletCount}
          isArmed={false}
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