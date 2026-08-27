'use client';

import { toast } from 'sonner';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useSendTransaction } from 'wagmi';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { formatEther, isHex, parseEther } from 'viem';
import { publicClient } from '@/lib/viem';
import { withdrawAllBurners, downloadWalletManifest, type WithdrawResult } from '@/lib/walletUtils';
import { 
  Eye, 
  EyeOff, 
  Copy, 
  AlertTriangle, 
  CheckCircle2, 
  Wallet, 
  Trash2, 
  RefreshCw, 
  Coins,
  Plus,
  Check,
  KeyRound,
  X,
  Download,
  ArrowDownToLine,
  ArrowUpFromLine
} from 'lucide-react';

export interface BurnerAccount {
  id: string;
  label: string;
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

const STORAGE_KEY = 'shift_burner_wallets';
const ACTIVE_KEY = 'shift_active_burner_id';
const MAX_WALLETS = 2;

export default function BurnerWalletManager() {
  const { address: connectedAddress } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();

  const [wallets, setWallets] = useState<BurnerAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<{ [id: string]: boolean }>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [balances, setBalances] = useState<{ [id: string]: string }>({});
  const [isFetching, setIsFetching] = useState(false);

  // Fund/Withdraw state
  const [fundAmount, setFundAmount] = useState('0.02');
  const [isFunding, setIsFunding] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawResults, setWithdrawResults] = useState<WithdrawResult[]>([]);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importKeyInput, setImportKeyInput] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Load saved wallets on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedActive = localStorage.getItem(ACTIVE_KEY);

    if (saved) {
      try {
        const parsed: BurnerAccount[] = JSON.parse(saved);
        setWallets(parsed);
        if (parsed.length > 0) {
          const selected = savedActive && parsed.some(w => w.id === savedActive) 
            ? savedActive 
            : parsed[0].id;
          setActiveId(selected);
        }
      } catch (e) {
        console.error('Failed to parse saved burner wallets:', e);
      }
    }
  }, []);

  // Fetch balances for all wallets
  const fetchAllBalances = useCallback(async () => {
    if (wallets.length === 0) return;
    setIsFetching(true);

    const newBalances: { [id: string]: string } = {};
    for (const wallet of wallets) {
      try {
        const raw = await publicClient.getBalance({ address: wallet.address });
        newBalances[wallet.id] = Number(formatEther(raw)).toFixed(4);
      } catch (err) {
        newBalances[wallet.id] = '0.0000';
      }
    }
    setBalances(newBalances);
    setIsFetching(false);
  }, [wallets]);

  useEffect(() => {
    fetchAllBalances();
  }, [wallets, fetchAllBalances]);

  // Create a new random burner wallet
  const handleCreateNew = () => {
    if (wallets.length >= MAX_WALLETS) return;
    toast.success('Burner wallet generated successfully!')
    const newPk = generatePrivateKey();
    saveNewWallet(newPk);
  };

  // Import existing private key
  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);

    let formattedKey = importKeyInput.trim();
    if (!formattedKey.startsWith('0x')) {
      formattedKey = `0x${formattedKey}`;
    }

    if (!isHex(formattedKey) || formattedKey.length !== 66) {
      setImportError('Invalid private key format. Must be a 32-byte hex string starting with 0x.');
      return;
    }

    try {
      // Test if private key can derive an account successfully
      privateKeyToAccount(formattedKey as `0x${string}`);
      
      saveNewWallet(formattedKey as `0x${string}`);
      setImportKeyInput('');
      setShowImportModal(false);
      toast.success('Burner wallet imported successfully!')
    } catch (err) {
      setImportError('Failed to derive account from private key. Check your input.');
    }
  };

  // Helper to save a wallet into state and localStorage
  const saveNewWallet = (pk: `0x${string}`) => {
    if (wallets.length >= MAX_WALLETS) return;

    const account = privateKeyToAccount(pk);
    
    // Ensure unique naming sequence
    const nextLabelNumber = wallets.length === 1 && wallets[0].label.includes('Burner') ? 2 : wallets.length + 1;
    
    const newWallet: BurnerAccount = {
      id: Date.now().toString(),
      label: `Burner #${nextLabelNumber}`,
      address: account.address,
      privateKey: pk
    };

    const updated = [...wallets, newWallet];
    setWallets(updated);
    
    if (updated.length === 1) {
      setActiveId(newWallet.id);
      localStorage.setItem(ACTIVE_KEY, newWallet.id);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  // Set active wallet
  const handleSetActive = (id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
  };

  // Delete specific burner wallet
  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this burner? Make sure you have exported the private key if it has funds!')) return;

    const updated = wallets.filter(w => w.id !== id);
    setWallets(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    if (activeId === id) {
      const nextActive = updated.length > 0 ? updated[0].id : null;
      setActiveId(nextActive);
      if (nextActive) localStorage.setItem(ACTIVE_KEY, nextActive);
      else localStorage.removeItem(ACTIVE_KEY);
    }
    toast.info('Burner wallet removed.')
  };

  // Send fundAmount from the connected wallet to every burner wallet
  const handleFundAll = async () => {
    if (wallets.length === 0) return;
    let amount: bigint;
    try {
      amount = parseEther(fundAmount);
    } catch {
      toast.error('Invalid fund amount.');
      return;
    }
    if (amount <= 0n) {
      toast.error('Fund amount must be greater than 0.');
      return;
    }

    setIsFunding(true);
    let successCount = 0;
    for (const wallet of wallets) {
      try {
        await sendTransactionAsync({ to: wallet.address, value: amount });
        successCount++;
      } catch (err: any) {
        toast.error(`Failed to fund ${wallet.label}: ${err.shortMessage ?? 'transaction rejected'}`);
      }
    }
    setIsFunding(false);
    if (successCount > 0) {
      toast.success(`Funded ${successCount}/${wallets.length} wallet(s) with ${fundAmount} ETH each.`);
      fetchAllBalances();
    }
  };

  // Sweep every burner wallet's balance back to the connected wallet
  const handleWithdrawAll = async () => {
    if (wallets.length === 0 || !connectedAddress) return;
    if (!confirm(`Sweep all burner balances to your connected wallet (${connectedAddress})? This cannot be undone.`)) return;

    setIsWithdrawing(true);
    setWithdrawResults([]);
    try {
      const results = await withdrawAllBurners(wallets, connectedAddress);
      setWithdrawResults(results);
      const successCount = results.filter((r) => r.status === 'success').length;
      toast.success(`Withdrawal complete: ${successCount}/${wallets.length} wallet(s) swept.`);
      fetchAllBalances();
    } catch (err) {
      toast.error('Withdrawal failed unexpectedly.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Export all wallets (including private keys) as a downloadable JSON file
  const handleExportManifest = () => {
    if (wallets.length === 0) return;
    if (!confirm('This file will contain your RAW PRIVATE KEYS in plain text. Anyone who gets this file can drain these wallets. Continue?')) return;
    downloadWalletManifest(wallets);
    toast.success('Wallet manifest downloaded.');
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-shift-card border border-slate-700 rounded-xl p-6 mb-6 relative">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Wallet className="text-shift-lime" /> BURNER WALLETS ({wallets.length}/{MAX_WALLETS})
          </h2>
          <p className="text-xs text-shift-textMuted mt-1">
            Manage up to {MAX_WALLETS} burner instances for sniping.
          </p>
        </div>

        <div className="flex gap-2">
          {wallets.length > 0 && (
            <button
              onClick={fetchAllBalances}
              disabled={isFetching}
              className="p-2.5 bg-slate-900 border border-slate-700 hover:border-slate-600 rounded-lg text-shift-textMuted hover:text-white transition-colors"
              title="Refresh Balances"
            >
              <RefreshCw size={16} className={isFetching ? 'animate-spin text-shift-lime' : ''} />
            </button>
          )}

          {/* Import Button */}
          <button
            onClick={() => setShowImportModal(true)}
            disabled={wallets.length >= MAX_WALLETS}
            className={`flex items-center gap-2 font-bold py-2.5 px-4 rounded-lg text-sm transition-colors border ${
              wallets.length >= MAX_WALLETS
                ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                : 'bg-slate-900 hover:bg-slate-800 text-shift-cyan border-slate-700'
            }`}
          >
            <KeyRound size={16} /> IMPORT
          </button>

          {/* Generate Button */}
          <button
            onClick={handleCreateNew}
            disabled={wallets.length >= MAX_WALLETS}
            className={`flex items-center gap-2 font-bold py-2.5 px-4 rounded-lg text-sm transition-colors ${
              wallets.length >= MAX_WALLETS 
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700' 
                : 'bg-shift-lime hover:bg-shift-limeHover text-shift-navy shadow-[0_0_15px_rgba(197,224,0,0.2)]'
            }`}
          >
            {wallets.length >= MAX_WALLETS ? (
              'MAX REACHED'
            ) : (
              <>
                <Plus size={16} /> NEW BURNER
              </>
            )}
          </button>
        </div>
      </div>

      {wallets.length > 0 && (
        <div className="mb-6 bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="text-xs font-bold text-shift-textMuted uppercase font-mono">Wallet Utilities</div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder="0.02"
                className="w-24 bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-xs text-white focus:border-shift-lime focus:outline-none"
              />
              <span className="text-xs text-shift-textMuted">ETH each</span>
              <button
                onClick={handleFundAll}
                disabled={isFunding || !connectedAddress}
                className="flex items-center gap-1.5 bg-shift-lime hover:bg-shift-limeHover text-shift-navy font-bold py-2 px-3 rounded-lg text-xs transition-colors disabled:opacity-50"
              >
                <ArrowDownToLine size={14} /> {isFunding ? 'Funding...' : 'Fund All'}
              </button>
            </div>

            <button
              onClick={handleWithdrawAll}
              disabled={isWithdrawing || !connectedAddress}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-shift-cyan font-bold py-2 px-3 rounded-lg text-xs transition-colors disabled:opacity-50 border border-slate-700"
            >
              <ArrowUpFromLine size={14} /> {isWithdrawing ? 'Withdrawing...' : 'Withdraw All to Main'}
            </button>

            <button
              onClick={handleExportManifest}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-red-400 font-bold py-2 px-3 rounded-lg text-xs transition-colors border border-slate-700"
            >
              <Download size={14} /> Export Manifest
            </button>
          </div>

          {!connectedAddress && (
            <p className="text-[11px] text-amber-400">Connect a wallet to fund or withdraw — burners will sweep to your connected wallet.</p>
          )}

          {withdrawResults.length > 0 && (
            <div className="pt-2 border-t border-slate-800 space-y-1">
              {withdrawResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
                  <span className={r.status === 'success' ? 'text-shift-lime' : r.status === 'skipped' ? 'text-amber-400' : 'text-red-400'}>
                    {r.status.toUpperCase()}
                  </span>
                  <span className="text-shift-textMuted truncate">{r.address}</span>
                  <span className="text-shift-textMuted">— {r.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {wallets.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
          <p className="text-shift-textMuted text-sm mb-4">No burner wallets created or imported yet.</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={handleCreateNew}
              className="bg-shift-lime hover:bg-shift-limeHover text-shift-navy font-bold py-2.5 px-6 rounded-lg text-sm transition-colors"
            >
              Create New Burner
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="bg-slate-900 border border-slate-700 hover:bg-slate-800 text-shift-cyan font-bold py-2.5 px-6 rounded-lg text-sm transition-colors"
            >
              Import Private Key
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {wallets.map((w) => {
            const isActive = w.id === activeId;
            const bal = balances[w.id] ?? '0.0000';
            const isKeyVisible = !!showKeys[w.id];

            return (
              <div
                key={w.id}
                className={`p-4 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-slate-900/90 border-shift-lime shadow-[0_0_15px_rgba(197,224,0,0.1)]'
                    : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleSetActive(w.id)}
                      className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                        isActive
                          ? 'bg-shift-lime border-shift-lime text-shift-navy'
                          : 'border-slate-600 hover:border-slate-400'
                      }`}
                      title="Set as Active Target"
                    >
                      {isActive && <Check size={14} strokeWidth={3} />}
                    </button>
                    <span className="font-bold text-sm">{w.label}</span>
                    {isActive && (
                      <span className="text-[10px] bg-shift-lime/20 text-shift-lime border border-shift-lime/30 px-2 py-0.5 rounded-full font-mono uppercase">
                        Active Sniper Target
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <Coins size={14} className="text-shift-lime" />
                      <span className="text-shift-lime font-bold">{bal} ETH</span>
                    </div>

                    <button
                      onClick={() => handleDelete(w.id)}
                      className="text-slate-600 hover:text-red-400 p-1 transition-colors"
                      title="Delete Burner"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Address Bar */}
                <div className="flex items-center bg-slate-950 rounded-lg p-2 font-mono text-xs mb-2">
                  <span className="text-shift-textMuted mr-2 select-none">Address:</span>
                  <span className="text-white flex-1 truncate">{w.address}</span>
                  <button
                    onClick={() => copyToClipboard(w.address, `addr-${w.id}`)}
                    className="p-1 text-shift-lime hover:bg-slate-800 rounded transition-colors ml-2"
                  >
                    {copiedId === `addr-${w.id}` ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  </button>
                </div>

                {/* Private Key Reveal */}
                <div className="flex items-center bg-red-950/20 border border-red-900/30 rounded-lg p-2 font-mono text-xs">
                  <span className="text-red-400 mr-2 select-none font-bold">Private Key:</span>
                  <input
                    readOnly
                    type={isKeyVisible ? 'text' : 'password'}
                    value={w.privateKey}
                    className="bg-transparent text-red-300 flex-1 focus:outline-none"
                  />
                  <button
                    onClick={() => setShowKeys((prev) => ({ ...prev, [w.id]: !prev[w.id] }))}
                    className="p-1 text-slate-400 hover:text-white transition-colors ml-2"
                  >
                    {isKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    onClick={() => copyToClipboard(w.privateKey, `pk-${w.id}`)}
                    className="p-1 text-slate-400 hover:text-white transition-colors ml-1"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-shift-card border border-slate-700 rounded-xl p-6 w-full max-w-md relative">
            <button 
              onClick={() => { setShowImportModal(false); setImportError(null); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <h3 className="text-base font-bold flex items-center gap-2 mb-2 text-shift-cyan">
              <KeyRound size={18} /> IMPORT BURNER PRIVATE KEY
            </h3>
            <p className="text-xs text-shift-textMuted mb-4">
              Paste an existing private key to load it into your local browser vault.
            </p>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-shift-textMuted mb-1 font-mono">Private Key (0x...)</label>
                <input
                  type="password"
                  value={importKeyInput}
                  onChange={(e) => setImportKeyInput(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-xs text-white focus:outline-none focus:border-shift-cyan"
                />
              </div>

              {importError && (
                <div className="bg-red-950/30 border border-red-900/50 p-3 rounded-lg text-xs text-red-400">
                  {importError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowImportModal(false); setImportError(null); }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-shift-cyan hover:bg-[#22a6e0] text-shift-navy rounded-lg text-xs font-bold transition-colors"
                >
                  Import Wallet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}