"use client";

import { toast } from "sonner";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useChainId, useSendTransaction } from "wagmi";
import { DEFAULT_CHAIN_ID, getChainConfig, SUPPORTED_CHAINS } from "@/lib/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { formatEther, isAddress, isHex, parseEther } from "viem";
import { publicClient } from "@/lib/viem";
import {
  withdrawAllBurners,
  sendAllBurnersToRecipient,
  downloadWalletManifest,
  type WithdrawResult,
  sendAllNftsFromBurner,
  type NftTransferResult,
} from "@/lib/walletUtils";
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
  ArrowUpFromLine,
  ImageUp,
  ChevronDown,
  Shield,
} from "lucide-react";

export interface BurnerAccount {
  id: string;
  label: string;
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

const STORAGE_KEY = "shift_burner_wallets";
const ACTIVE_KEY = "shift_active_burner_id";
const MAX_WALLETS = 2;

export default function BurnerWalletManager() {
  const { address: connectedAddress } = useAccount();
  const connectedChainId = useChainId();
  const chainId = SUPPORTED_CHAINS.some((chain) => chain.id === connectedChainId)
    ? connectedChainId
    : DEFAULT_CHAIN_ID;
  const chainLabel = getChainConfig(chainId).label;
  const { sendTransactionAsync } = useSendTransaction();

  const [wallets, setWallets] = useState<BurnerAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<{ [id: string]: boolean }>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [balances, setBalances] = useState<{ [id: string]: string }>({});
  const [isFetching, setIsFetching] = useState(false);

  // Fund/Withdraw state
  const [fundAmount, setFundAmount] = useState("");
  const [isFunding, setIsFunding] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawResults, setWithdrawResults] = useState<WithdrawResult[]>([]);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [nftScope, setNftScope] = useState<"ACTIVE" | "ALL">("ACTIVE");
  const [nftResults, setNftResults] = useState<NftTransferResult[]>([]);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importKeyInput, setImportKeyInput] = useState("");
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
          const selected = savedActive && parsed.some((w) => w.id === savedActive) ? savedActive : parsed[0].id;
          setActiveId(selected);
        }
      } catch (e) {
        console.error("Failed to parse saved burner wallets:", e);
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
        newBalances[wallet.id] = "0.0000";
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
    toast.success("Burner wallet generated successfully!");
    const newPk = generatePrivateKey();
    saveNewWallet(newPk);
  };

  // Import existing private key
  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);

    let formattedKey = importKeyInput.trim();
    if (!formattedKey.startsWith("0x")) {
      formattedKey = `0x${formattedKey}`;
    }

    if (!isHex(formattedKey) || formattedKey.length !== 66) {
      setImportError("Invalid private key format. Must be a 32-byte hex string starting with 0x.");
      return;
    }

    try {
      // Test if private key can derive an account successfully
      privateKeyToAccount(formattedKey as `0x${string}`);

      saveNewWallet(formattedKey as `0x${string}`);
      setImportKeyInput("");
      setShowImportModal(false);
      toast.success("Burner wallet imported successfully!");
    } catch (err) {
      setImportError("Failed to derive account from private key. Check your input.");
    }
  };

  // Helper to save a wallet into state and localStorage
  const saveNewWallet = (pk: `0x${string}`) => {
    if (wallets.length >= MAX_WALLETS) return;

    const account = privateKeyToAccount(pk);

    // Ensure unique naming sequence
    const nextLabelNumber = wallets.length === 1 && wallets[0].label.includes("Burner") ? 2 : wallets.length + 1;

    const newWallet: BurnerAccount = {
      id: Date.now().toString(),
      label: `Burner #${nextLabelNumber}`,
      address: account.address,
      privateKey: pk,
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
    if (
      !confirm(
        "Are you sure you want to delete this burner? Make sure you have exported the private key if it has funds!",
      )
    )
      return;

    const updated = wallets.filter((w) => w.id !== id);
    setWallets(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

    if (activeId === id) {
      const nextActive = updated.length > 0 ? updated[0].id : null;
      setActiveId(nextActive);
      if (nextActive) localStorage.setItem(ACTIVE_KEY, nextActive);
      else localStorage.removeItem(ACTIVE_KEY);
    }
    toast.info("Burner wallet removed.");
  };

  // Send fundAmount from the connected wallet to every burner wallet
  const handleFundAll = async () => {
    if (wallets.length === 0) return;
    let amount: bigint;
    try {
      amount = parseEther(fundAmount);
    } catch {
      toast.error("Invalid fund amount.");
      return;
    }
    if (amount <= 0n) {
      toast.error("Fund amount must be greater than 0.");
      return;
    }

    setIsFunding(true);
    let successCount = 0;
    for (const wallet of wallets) {
      try {
        await sendTransactionAsync({ to: wallet.address, value: amount });
        successCount++;
      } catch (err: any) {
        toast.error(`Failed to fund ${wallet.label}: ${err.shortMessage ?? "transaction rejected"}`);
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
    if (!confirm(`Sweep all burner balances to your connected wallet (${connectedAddress})? This cannot be undone.`))
      return;

    setIsWithdrawing(true);
    setWithdrawResults([]);
    try {
      const results = await withdrawAllBurners(wallets, connectedAddress, chainId);
      setWithdrawResults(results);
      const successCount = results.filter((r) => r.status === "success").length;
      toast.success(`Withdrawal complete: ${successCount}/${wallets.length} wallet(s) swept.`);
      fetchAllBalances();
    } catch (err) {
      toast.error("Withdrawal failed unexpectedly.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleSendAllToAddress = async () => {
    const recipient = recipientAddress.trim();
    if (!isAddress(recipient)) {
      toast.error("Enter a valid recipient wallet address.");
      return;
    }
    if (wallets.some((wallet) => wallet.address.toLowerCase() === recipient.toLowerCase())) {
      toast.error("Recipient must be different from the burner wallets.");
      return;
    }
    if (!confirm(`Send each burner balance, minus gas, to ${recipient}? This cannot be undone.`)) return;

    setIsWithdrawing(true);
    setWithdrawResults([]);
    try {
      const results = await sendAllBurnersToRecipient(wallets, recipient, chainId);
      setWithdrawResults(results);
      const successCount = results.filter((result) => result.status === "success").length;
      toast.success(`Transfer complete: ${successCount}/${wallets.length} wallet(s) sent.`);
      fetchAllBalances();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer failed unexpectedly.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleSendActiveToAddress = async () => {
    const recipient = recipientAddress.trim();
    const activeWallet = wallets.find((wallet) => wallet.id === activeId) ?? wallets[0];
    if (!activeWallet) return;
    if (!isAddress(recipient)) {
      toast.error("Enter a valid recipient wallet address.");
      return;
    }
    if (activeWallet.address.toLowerCase() === recipient.toLowerCase()) {
      toast.error("Recipient must be different from the active burner.");
      return;
    }
    if (!confirm(`Send ${activeWallet.label}'s balance, minus gas, to ${recipient}? This cannot be undone.`)) return;

    setIsWithdrawing(true);
    setWithdrawResults([]);
    try {
      const results = await sendAllBurnersToRecipient([activeWallet], recipient, chainId);
      setWithdrawResults(results);
      toast.success(`${activeWallet.label} transfer complete.`);
      fetchAllBalances();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Transfer failed unexpectedly.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleSendNfts = async () => {
    const activeWallet = wallets.find((wallet) => wallet.id === activeId) ?? wallets[0];
    if (!activeWallet || !isAddress(recipientAddress)) {
      toast.error("Enter a recipient address.");
      return;
    }
    if (activeWallet.address.toLowerCase() === recipientAddress.trim().toLowerCase()) {
      toast.error("Recipient must be different from the active burner.");
      return;
    }
    const sourceWallets = nftScope === "ALL" ? wallets : [activeWallet];
    if (!confirm(`Transfer all ERC-721 NFTs from ${nftScope === "ALL" ? "all burners" : activeWallet.label} to ${recipientAddress}? This cannot be undone.`)) {
      return;
    }

    setIsWithdrawing(true);
    setNftResults([]);
    try {
      const resultGroups = await Promise.all(
        sourceWallets.map((wallet) =>
          sendAllNftsFromBurner(wallet, recipientAddress.trim(), chainId),
        ),
      );
      const results = resultGroups.flat();
      setNftResults(results);
      const successCount = results.filter((result) => result.status === "success").length;
      toast.success(`NFT transfer submitted: ${successCount}/${results.length} token(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "NFT transfer failed.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Export all wallets (including private keys) as a downloadable JSON file
  const handleExportManifest = () => {
    if (wallets.length === 0) return;
    if (
      !confirm(
        "This file will contain your RAW PRIVATE KEYS in plain text. Anyone who gets this file can drain these wallets. Continue?",
      )
    )
      return;
    downloadWalletManifest(wallets);
    toast.success("Wallet manifest downloaded.");
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="relative">
      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">

        <aside className="rounded-2xl border border-slate-700 bg-slate-950/70 p-5 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]">

          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-shift-lime">
              <Wallet size={15} />
            </div>
            <div className="text-[11px] font-bold tracking-[0.18em] text-shift-textMuted">WALLET UTILITIES</div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder="0.02"
                className="w-28 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-[13px] text-white outline-none ring-0 placeholder:text-slate-500 focus:border-shift-lime"
              />
              <span className="text-[12px] text-shift-textMuted">ETH each</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleFundAll}
                disabled={isFunding || !connectedAddress}
                className="rounded-lg bg-shift-lime px-3 py-2 text-sm font-bold text-shift-navy transition hover:bg-shift-lime/90 disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowDownToLine size={14} />
                  {isFunding ? "Funding..." : "Fund All"}
                </span>
              </button>

              <button
                onClick={handleWithdrawAll}
                disabled={isWithdrawing || !connectedAddress}
                className="rounded-lg border border-cyan-500/40 bg-slate-900 px-3 py-2 text-sm font-bold text-cyan-400 transition hover:bg-slate-800 disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  <ArrowUpFromLine size={14} />
                  {isWithdrawing ? "Withdrawing..." : "Withdraw All"}
                </span>
              </button>
            </div>

            <div className="space-y-3 pt-2">
              <input
                type="text"
                value={recipientAddress}
                onChange={(event) => setRecipientAddress(event.target.value)}
                placeholder="0x recipient address"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-[12px] text-white outline-none placeholder:text-slate-500 focus:border-cyan-500"
                aria-label="Recipient wallet address"
              />

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => void handleSendAllToAddress()}
                  disabled={isWithdrawing || wallets.length === 0}
                  className="rounded-lg border border-cyan-500/40 bg-slate-900 px-3 py-2 text-[12px] font-bold text-cyan-400 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Send All to Address
                </button>

                <button
                  onClick={() => void handleSendActiveToAddress()}
                  disabled={isWithdrawing || wallets.length === 0}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[12px] font-bold text-shift-lime transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Send Active
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] text-shift-textMuted">SEND ALL NFTs (AUTO-DISCOVER)</div>

              <div className="grid grid-cols-[1fr_160px] gap-3">
                <select
                  value={nftScope}
                  onChange={(event) => setNftScope(event.target.value as "ACTIVE" | "ALL")}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[12px] text-white outline-none focus:border-cyan-500"
                  aria-label="NFT source wallets"
                >
                  <option value="ACTIVE">Active burner</option>
                  <option value="ALL">All burners</option>
                </select>

                <div className="flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[12px] text-shift-textMuted">
                  ERC-721 & ERC-721-C
                </div>
              </div>

              <button
                onClick={() => void handleSendNfts()}
                disabled={isWithdrawing || wallets.length === 0}
                className="w-full rounded-lg bg-cyan-400 px-3 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-2">
                  <ImageUp size={15} />
                  {isWithdrawing ? "Transferring..." : "Send All NFTs"}
                </span>
              </button>
            </div>

            <button
              onClick={handleExportManifest}
              className="mt-2 w-full rounded-lg border border-red-500/50 bg-transparent px-3 py-2 text-sm font-bold text-red-400 transition hover:bg-red-500/5"
            >
              <span className="inline-flex items-center gap-2">
                <Download size={15} />
                Export Manifest
              </span>
            </button>
          </div>
        </aside>

        <section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-5 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)]">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-shift-lime">
                <Wallet size={15} />
              </div>
              <div className="text-[11px] font-bold tracking-[0.18em] text-shift-textMuted">BURNER WALLETS ({wallets.length}/{MAX_WALLETS})</div>
            </div>

            <div className="flex items-center gap-2">
              {wallets.length > 0 && (
                <button
                  onClick={fetchAllBalances}
                  disabled={isFetching}
                  className="flex h-9 w-9 items-center cursor-pointer justify-center rounded-lg border border-slate-700 bg-slate-900 text-shift-textMuted transition hover:border-slate-600 hover:text-white disabled:opacity-50"
                  title="Refresh Balances"
                >
                  <RefreshCw size={14} className={isFetching ? "animate-spin text-shift-lime" : ""} />
                </button>
              )}

              <button
                onClick={() => setShowImportModal(true)}
                disabled={wallets.length >= MAX_WALLETS}
                className="flex items-center gap-2 rounded-sm cursor-pointer border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-bold text-shift-cyan transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <KeyRound size={15} />
                IMPORT
              </button>

              <button
                onClick={handleCreateNew}
                disabled={wallets.length >= MAX_WALLETS}
                className={`rounded-sm px-3 py-2 text-[11px] cursor-pointer  font-bold transition ${
                  wallets.length >= MAX_WALLETS
                    ? "cursor-not-allowed border border-slate-700 bg-slate-800 text-slate-500"
                    : "bg-shift-lime text-shift-navy hover:bg-shift-lime/90"
                }`}
              >
                {wallets.length >= MAX_WALLETS ? "MAX REACHED" : "NEW BURNER"}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {wallets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-12 text-center text-shift-textMuted">
                No burner wallets created yet.
              </div>
            ) : (
              wallets.map((w) => {
                const isActive = w.id === activeId;
                const bal = balances[w.id] ?? "0.0000";
                const isKeyVisible = !!showKeys[w.id];

                return (
                  <div
                    key={w.id}
                    className={`rounded-xl border p-4 ${
                      isActive
                        ? "border-shift-lime/50 bg-slate-900/90 shadow-[0_0_18px_rgba(197,224,0,0.08)]"
                        : "border-slate-700 bg-slate-900/30"
                    }`}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleSetActive(w.id)}
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                            isActive
                              ? "border-shift-lime bg-shift-lime text-slate-950"
                              : "border-slate-500 bg-slate-900 text-transparent hover:border-slate-400"
                          }`}
                          title="Set as Active Target"
                        >
                          {isActive && <Check size={12} strokeWidth={3} />}
                        </button>

                        <span className="text-[15px] font-bold text-white">{w.label}</span>

                        {isActive && (
                          <span className="rounded-full border border-shift-lime/40 bg-shift-lime/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-shift-lime">
                            ACTIVE SNIPER TARGET
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[13px] font-bold text-shift-lime">{bal} ETH</span>
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="text-slate-500 transition hover:text-red-400"
                          title="Delete Burner"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/80 p-2.5">
                      <span className="text-[12px] font-medium text-shift-textMuted">Address</span>
                      <span className="flex-1 truncate font-mono text-[12px] text-white">{w.address}</span>
                      <button
                        onClick={() => copyToClipboard(w.address, `addr-${w.id}`)}
                        className="text-shift-lime transition hover:text-lime-300"
                      >
                        {copiedId === `addr-${w.id}` ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                      </button>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/80 p-2.5">
                      <span className="text-[12px] font-medium text-shift-textMuted">Private Key</span>
                      <input
                        readOnly
                        type={isKeyVisible ? "text" : "password"}
                        value={w.privateKey}
                        className="flex-1 bg-transparent font-mono text-[12px] text-red-300 outline-none placeholder:text-red-400"
                      />
                      <button
                        onClick={() => setShowKeys((prev) => ({ ...prev, [w.id]: !prev[w.id] }))}
                        className="text-slate-400 transition hover:text-white"
                      >
                        {isKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        onClick={() => copyToClipboard(w.privateKey, `pk-${w.id}`)}
                        className="text-slate-400 transition hover:text-white"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4 text-[12px] text-shift-textMuted">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full border border-slate-600">
            <Shield size={10} />
          </span>
          <span>Your keys are encrypted and never stored.</span>
        </div>

        <div className="flex items-center gap-3 text-shift-textMuted">
          <span className="inline-flex items-center gap-1"><Shield size={12} /> Secure</span>
          <span>·</span>
          <span>Private</span>
          <span>·</span>
          <span>Non-custodial</span>
        </div>
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-shift-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-shift-cyan">
                <KeyRound size={18} />
                IMPORT BURNER PRIVATE KEY
              </h3>
              <button onClick={() => { setShowImportModal(false); setImportError(null); }} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <p className="mb-4 text-xs text-shift-textMuted">Paste an existing private key to load it into your local browser vault.</p>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-[11px] font-bold tracking-[0.14em] text-shift-textMuted">PRIVATE KEY (0X...)</label>
                <input
                  type="password"
                  value={importKeyInput}
                  onChange={(e) => setImportKeyInput(e.target.value)}
                  placeholder="0x..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 font-mono text-xs text-white outline-none focus:border-shift-cyan"
                />
              </div>

              {importError && (
                <div className="rounded-lg border border-red-500/50 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                  {importError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportModal(false);
                    setImportError(null);
                  }}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-shift-cyan px-4 py-2 text-xs font-bold text-shift-navy hover:bg-cyan-300"
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
