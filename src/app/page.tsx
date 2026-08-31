"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { toast } from "sonner";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import LandingPage from "@/components/LandingPage";
import DoctorPanel from "@/components/DoctorPanel";
import Sidebar from "@/components/Sidebar";
import SniperConfig from "@/components/SniperConfig";
import ActiveSnipesList from "@/components/ActiveSnipesList";
import LiveTerminal from "@/components/LiveTerminal";
import { signBurnerSnipeFeeTiers } from "@/lib/signBurnerTx";
import { DEFAULT_CHAIN_ID, getChainConfig, SUPPORTED_CHAINS } from "@/lib/chains";

interface SniperResult {
  id: string;
  timestamp: string;

  collectionName?: string;
  collectionSymbol?: string;
  collectionImage?: string;

  targetContract: string;
  transactionTo?: string;

  mode: "BURNER";

  requestedQuantity: number;
  mintedQuantity?: number;

  mintPriceEth?: string;
  totalMintCostEth?: string;
  gasUsedEth?: string;

  tokenIds?: string[];

  status: "SUCCESS" | "FAILED";

  txHash?: string;
  blockNumber?: string;
  bumpTier?: number;

  signerAddress?: string;
  errorMessage?: string;
}

interface SniperStatus {
  id: string;

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

  targetContract: string;
  transactionTo?: string;

  collectionName?: string;
  collectionSymbol?: string;
  collectionImage?: string;

  mintPriceEth?: string;
  requestedQuantity: number;

  targetFunctionName?: string;

  executionMode: "BURNER";

  scheduledFor?: string;
  endsAt?: string;

  createdAt?: string;
  updatedAt?: string;

  signerAddress?: string;

  currentTier?: number;

  broadcastTxHashes?: string[];

  errorMessage?: string;

  result?: SniperResult | null;
}

interface SavedSniperConfig {
  targetContract: string;
  mintPrice: string;
  maxQuantity: number;
  functionName: string;

  mode: "BURNER";

  maxFeeGwei: string;
  priorityTipGwei: string;

  useAllWallets: boolean;

  collectionName?: string;
  collectionSymbol?: string;
  collectionImage?: string;

  phaseType: "PUBLIC" | "GUARANTEED_WL" | "FCFS_WL";
  merkleRoot: string;
  merkleProofsJson: string;
  mintCalldata: string;
}

const STORAGE_KEY = "shift_sniper_config";

const TASK_STORAGE_KEY = "shift_sniper_task_ids";

const POLL_INTERVAL = 1500;

export default function Home() {
  const { isConnected } = useAccount();
  const connectedChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const mode = "BURNER" as const;

  const [targetContract, setTargetContract] = useState("");

  const [mintPrice, setMintPrice] = useState("0");

  const [maxQuantity, setMaxQuantity] = useState(0);

  const [functionName, setFunctionName] = useState("");

  const [collectionName, setCollectionName] = useState("");

  const [collectionSymbol, setCollectionSymbol] = useState("");

  const [collectionImage, setCollectionImage] = useState("");

  const [phaseType, setPhaseType] = useState<"PUBLIC" | "GUARANTEED_WL" | "FCFS_WL">("PUBLIC");

  const [merkleRoot, setMerkleRoot] = useState("");

  const [merkleProofsJson, setMerkleProofsJson] = useState("");
  const [mintCalldata, setMintCalldata] = useState("");

  const [useAllWallets, setUseAllWallets] = useState(false);

  const [savedWalletCount, setSavedWalletCount] = useState(0);

  const [loading, setLoading] = useState(false);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [logs, setLogs] = useState<string[]>([]);

  const [maxFeeGwei, setMaxFeeGwei] = useState("25");

  const [priorityTipGwei, setPriorityTipGwei] = useState("5");

  const [taskIds, setTaskIds] = useState<string[]>([]);

  const [selectedChainId, setSelectedChainId] = useState<number>(DEFAULT_CHAIN_ID);
  const selectedChain = getChainConfig(selectedChainId);

  const processedEvents = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (SUPPORTED_CHAINS.some((config) => config.id === connectedChainId)) {
      setSelectedChainId(connectedChainId);
    }
  }, [connectedChainId]);

  const handleChainChange = async (chainId: number) => {
    const previousChainId = selectedChainId;
    setSelectedChainId(chainId);

    if (chainId !== connectedChainId) {
      try {
        await switchChainAsync({ chainId });
      } catch {
        setSelectedChainId(previousChainId);
        toast.error("Network switch was rejected.");
      }
    }
  };

  // Logging

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();

    setLogs((previous) => [...previous, `[${timestamp}] ${message}`]);
  };

  // Load saved config

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const config = JSON.parse(saved) as SavedSniperConfig;

        setTargetContract(config.targetContract ?? "");

        setMintPrice(config.mintPrice ?? "0");

        setMaxQuantity(config.maxQuantity ?? 0);

        setFunctionName(config.functionName ?? "");


        setMaxFeeGwei(config.maxFeeGwei ?? "");

        setPriorityTipGwei(config.priorityTipGwei ?? "");

        setUseAllWallets(config.useAllWallets ?? false);

        setCollectionName(config.collectionName ?? "");

        setCollectionSymbol(config.collectionSymbol ?? "");

        setCollectionImage(config.collectionImage ?? "");

        setPhaseType(config.phaseType ?? "PUBLIC");

        setMerkleRoot(config.merkleRoot ?? "");

        setMerkleProofsJson(config.merkleProofsJson ?? "");
  setMintCalldata(config.mintCalldata ?? "");

        addLog("♻️ Previous sniper configuration restored.");
      }
    } catch (error) {
      console.error("Failed to restore sniper configuration:", error);
    }
  }, []);

  // Save contract information and configuration when leaving the sniper page.

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const config: SavedSniperConfig = {
      targetContract,
      mintPrice,
      maxQuantity,
      functionName,

      mode,

      maxFeeGwei,
      priorityTipGwei,

      useAllWallets,

      collectionName,
      collectionSymbol,
      collectionImage,

      phaseType,
      merkleRoot,
      merkleProofsJson,
      mintCalldata,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [
    targetContract,
    mintPrice,
    maxQuantity,
    functionName,
    mode,
    maxFeeGwei,
    priorityTipGwei,
    useAllWallets,
    collectionName,
    collectionSymbol,
    collectionImage,
    phaseType,
    merkleRoot,
    merkleProofsJson,
    mintCalldata,
  ]);

  // Restore active task IDs

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const saved = localStorage.getItem(TASK_STORAGE_KEY);

      if (!saved) {
        return;
      }

      const ids = JSON.parse(saved);

      if (Array.isArray(ids)) {
        setTaskIds(ids);
      }
    } catch {
      // Ignore malformed local storage.
    }
  }, []);

  // Save task IDs

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(taskIds));
  }, [taskIds]);

  // Count saved wallets

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const savedWalletsRaw = localStorage.getItem("shift_burner_wallets");

      const wallets = savedWalletsRaw ? JSON.parse(savedWalletsRaw) : [];

      setSavedWalletCount(Array.isArray(wallets) ? wallets.length : 0);
    } catch {
      setSavedWalletCount(0);
    }
  }, []);

  // Initialize terminal

  useEffect(() => {
    setLogs([
      `[${new Date().toLocaleTimeString()}] System initialized.`,
      `[${new Date().toLocaleTimeString()}] Connected to Robinhood Chain L2.`,
    ]);
  }, []);

  // Handle sniper status events

  const processStatus = (status: SniperStatus) => {
    // Prevent duplicate terminal messages.
    const eventKey = `${status.id}:${status.status}:${status.updatedAt}:${status.statusMessage}`;

    if (processedEvents.current.has(eventKey)) {
      return;
    }

    processedEvents.current.add(eventKey);

    const message = status.statusMessage;

    // Waiting
    if ((status.status === "WAITING" || status.status === "SCHEDULED") && message) {
      addLog(`⏳ ${message}`);

      return;
    }

    // Armed
    if (status.status === "ARMED" || status.status === "READY") {
      addLog(
        `🎯 SNIPER ARMED — ${status.collectionName ?? "Unknown Collection"} — Quantity: ${status.requestedQuantity}`,
      );

      return;
    }

    // Broadcasting
    if (status.status === "BROADCASTING") {
      const txHash = status.broadcastTxHashes?.[status.broadcastTxHashes.length - 1];

      if (txHash) {
        addLog(`📡 TRANSACTION BROADCAST — Tier ${(status.currentTier ?? 0) + 1} — ${txHash}`);
      } else if (message) {
        addLog(`📡 ${message}`);
      }

      return;
    }

    // Confirmed
    if (status.status === "CONFIRMED") {
      const result = status.result;

      if (result) {
        addLog(`✅ MINT SUCCESS — ${result.collectionName ?? status.collectionName ?? "Unknown Collection"}`);

        addLog(`🖼 NFTs MINTED: ${result.mintedQuantity ?? result.requestedQuantity}`);

        if (result.mintPriceEth) {
          addLog(`💰 MINT PRICE: ${result.mintPriceEth} ETH`);
        }

        if (result.totalMintCostEth) {
          addLog(`💵 TOTAL MINT COST: ${result.totalMintCostEth} ETH`);
        }

        if (result.gasUsedEth) {
          addLog(`⛽ GAS USED: ${result.gasUsedEth} ETH`);
        }

        if (result.tokenIds && result.tokenIds.length > 0) {
          addLog(`🎨 TOKEN IDs: ${result.tokenIds.join(", ")}`);
        }

        if (result.txHash) {
          addLog(`🔗 TX: ${result.txHash}`);
        }
      } else if (message) {
        addLog(`✅ ${message}`);
      }

      toast.success(
        `Mint successful — ${result?.mintedQuantity ?? status.requestedQuantity} NFT${
          (result?.mintedQuantity ?? status.requestedQuantity) === 1 ? "" : "s"
        } minted.`,
      );

      return;
    }

    // Failed
    if (status.status === "FAILED") {
      addLog(`❌ MINT FAILED — ${status.errorMessage ?? status.statusMessage ?? "Unknown error"}`);

      return;
    }

    if (status.status === "EXPIRED") {
      addLog(`⌛ MINT EXPIRED — ${status.errorMessage ?? status.statusMessage ?? "The mint phase ended."}`);

      return;
    }

    // Cancelled
    if (status.status === "CANCELLED") {
      addLog("🛑 SNIPER TASK CANCELLED.");
    }
  };

  // Poll sniper status

  useEffect(() => {
    if (taskIds.length === 0) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      try {
        const statuses = await Promise.all(
          taskIds.map(async (taskId) => {
            const response = await fetch(`/api/sniper?taskId=${encodeURIComponent(taskId)}`, {
              cache: "no-store",
            });

            if (!response.ok) {
              return null;
            }

            const data = await response.json();

            if (!data.success) {
              return null;
            }

            return data.status as SniperStatus;
          }),
        );

        if (cancelled) {
          return;
        }

        for (const status of statuses) {
          if (status) {
            processStatus(status);
          }
        }

        // Refresh active snipes.
        setRefreshTrigger((value) => value + 1);

        // Keep completed task IDs briefly so returning to the page can still retrieve their result.
        const stillRelevant = statuses
          .filter((status): status is SniperStatus => status !== null)
          .filter(
            (status) =>
              status.status === "ARMED" ||
              status.status === "WAITING" ||
              status.status === "SCHEDULED" ||
              status.status === "READY" ||
              status.status === "BROADCASTING",
          )
          .map((status) => status.id);

        if (stillRelevant.length !== taskIds.length) {
          setTaskIds((previous) =>
            previous.filter(
              (id) =>
                stillRelevant.includes(id) ||
                statuses.some(
                  (status) => status?.id === id && (status.status === "CONFIRMED" || status.status === "FAILED"),
                ),
            ),
          );
        }
      } catch (error) {
        console.error("Sniper status polling error:", error);
      }
    };

    void poll();

    const interval = setInterval(() => {
      void poll();
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [taskIds]);

  // Arm sniper

  const handleArmSniper = async () => {
    if (!targetContract) {
      toast.error("Enter a contract address.");

      return;
    }

    if (!maxQuantity || maxQuantity < 1) {
      toast.error("Enter a valid quantity.");

      return;
    }

    if (phaseType !== "PUBLIC" && (!/^0x[0-9a-fA-F]*$/.test(mintCalldata) || mintCalldata.length < 10)) {
      toast.error("Enter the encoded calldata for this WL phase.");
      return;
    }

    setLoading(true);

    try {
      const payloadParams: Record<string, unknown> = {
        targetContract,

        chainId: selectedChainId,

        mintPriceEth: mintPrice,

        maxQuantity,

        functionName,

        mode,

        phaseType,

        merkleRoot,

        merkleProofsJson,

        maxFeeGwei,

        priorityTipGwei,
      };

      const transactionsForSimulation: string[] = [];

      // Burner mode

      if (mode === "BURNER") {
        const savedWalletsRaw = localStorage.getItem("shift_burner_wallets");

        const activeId = localStorage.getItem("shift_active_burner_id");

        if (!savedWalletsRaw) {
          addLog("❌ ERROR: No burner wallets saved!");

          toast.error("No burner wallets saved.");

          return;
        }

        const wallets: {
          id: string;
          privateKey: `0x${string}`;
        }[] = JSON.parse(savedWalletsRaw);

        if (wallets.length === 0) {
          addLog("❌ ERROR: No burner wallets saved!");

          toast.error("No burner wallets saved.");

          return;
        }

        const walletsToSign = useAllWallets
          ? wallets
          : [wallets.find((wallet) => wallet.id === activeId) ?? wallets[0]];

        addLog(
          useAllWallets
            ? `🟡 Signing fee-bump ladders for ${walletsToSign.length} wallet(s) locally... keys never leave the browser.`
            : "🟡 Signing fee-bump ladder locally... key never leaves the browser.",
        );

        try {
          const signedResults = await Promise.all(
            walletsToSign.map((wallet) =>
              signBurnerSnipeFeeTiers({
                privateKey: wallet.privateKey,

                chainId: selectedChainId,

                targetContract: targetContract as `0x${string}`,

                quantity: maxQuantity,

                fallbackPriceEth: mintPrice,

                functionName,

                maxFeeGwei,

                priorityTipGwei,

                mintCalldata: phaseType === "PUBLIC" ? undefined : (mintCalldata as `0x${string}`),
              }),
            ),
          );

          payloadParams.feeTiersBatch = signedResults.map((result) => result.feeTiers);
          transactionsForSimulation.push(...signedResults.map((result) => result.feeTiers[0]));

          addLog(
            `✅ Signed ${signedResults.length} wallet(s), ${signedResults[0]?.feeTiers.length ?? 0} fee tier(s) each.`,
          );
        } catch (signError: any) {
          addLog(`❌ Local signing failed: ${signError?.message ?? "Unknown error"}`);

          toast.error("Local signing failed.");

          return;
        }
      }

      addLog("🔎 Simulating the first signed transaction for each wallet...");
      const simulations = await Promise.all(
        transactionsForSimulation.map(async (serializedTransaction) => {
          try {
            const response = await fetch("/api/simulate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ serializedTransaction, chainId: selectedChainId }),
            });
            return (await response.json()) as { status?: string; error?: string };
          } catch {
            return { status: "UNAVAILABLE", error: "Simulation service was unreachable." };
          }
        }),
      );

      const reverted = simulations.filter((result) => result.status === "REVERT");
      const passed = simulations.filter((result) => result.status === "PASS");
      if (reverted.length > 0) {
        addLog(`⚠️ Simulation reverted for ${reverted.length} wallet(s). This can be expected before a scheduled phase or for WL authorization.`);
        toast.warning("Simulation reported a revert. Review the target and mint phase before arming.");
      } else if (passed.length === simulations.length) {
        addLog(`✅ Simulation passed for ${passed.length} wallet(s).`);
      } else {
        addLog("⚠️ Simulation was unavailable; the signed payload can still be armed.");
      }

      // Create server task

      const response = await fetch("/api/sniper", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(payloadParams),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        addLog(`❌ API Error: ${data.error ?? "Failed to arm sniper."}`);

        toast.error(data.error ?? "Failed to arm sniper.");

        return;
      }

      const returnedTaskIds: string[] = Array.isArray(data.taskIds) ? data.taskIds : data.taskId ? [data.taskId] : [];

      if (returnedTaskIds.length === 0) {
        addLog("❌ API Error: Server did not return a task ID.");

        toast.error("Sniper task was not created.");

        return;
      }

      // Save task IDs.
      setTaskIds((previous) => [...new Set([...previous, ...returnedTaskIds])]);

      // Show collection name immediately.
      addLog(`🎯 ${returnedTaskIds.length} SNIPER TASK${returnedTaskIds.length === 1 ? "" : "S"} ARMED`);

      addLog(`📦 Collection: ${collectionName || "Detecting collection..."}`);

      addLog(`📍 Contract: ${targetContract}`);

      addLog(`🖼️ Requested NFT quantity: ${maxQuantity}`);

      setRefreshTrigger((previous) => previous + 1);

      toast.success(
        `Sniper ${returnedTaskIds.length} task${returnedTaskIds.length === 1 ? "" : "s"} armed successfully!`,
      );
    } catch (error) {
      console.error("Sniper arm error:", error);

      addLog("❌ Network Error: Could not reach sniper engine.");

      toast.error("Could not reach sniper engine.");
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return <LandingPage />;
  }

  // Render

  return (
    <div className="flex">
      <Sidebar />

      <main className="flex-1 px-8 py-6 overflow-y-auto max-w-7xl mx-auto">

        <header className="flex justify-between items-center mb-6 gap-4 ">
          <div className="flex items-center gap-3">
            <label className="sr-only" htmlFor="sniper-chain">
              Network
            </label>
            
            {/* <select
              id="sniper-chain"
              value={selectedChainId}
              onChange={(event) => void handleChainChange(Number(event.target.value))}
              className="bg-slate-900 border cursor-pointer border-slate-700 rounded-md px-3 py-3 text-sm tracking-widest text-white"
            >
              {SUPPORTED_CHAINS.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.label}
                </option>
              ))}
            </select> */}
           
          </div>
           <ConnectButton showBalance={false} />
          {/* <div className="text-xs  bg-shift-card border border-slate-700 px-4 py-3 rounded-lg flex gap-2 tracking-widest items-center justify-between min-w-55">
            <span className="text-shift-textMuted">{selectedChain.label} Gas</span>

            <span className=" text-shift-lime">12.4 Gwei</span>
          </div> */}
        </header>

        <DoctorPanel />

        <SniperConfig
          targetContract={targetContract}
          chainId={selectedChainId}
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
          useAllWallets={useAllWallets}
          setUseAllWallets={setUseAllWallets}
          savedWalletCount={savedWalletCount}
          setCollectionName={setCollectionName}
          setCollectionSymbol={setCollectionSymbol}
          setCollectionImage={setCollectionImage}
          phaseType={phaseType}
          setPhaseType={setPhaseType}
          merkleRoot={merkleRoot}
          setMerkleRoot={setMerkleRoot}
          merkleProofsJson={merkleProofsJson}
          setMerkleProofsJson={setMerkleProofsJson}
          mintCalldata={mintCalldata}
          setMintCalldata={setMintCalldata}
          isArmed={false}
          loading={loading}
          onToggleArm={handleArmSniper}
        />

        {targetContract && (
          <div className="bg-shift-card border border-slate-700 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs text-shift-textMuted font-mono uppercase">Target Collection</p>

                <h3 className="text-xl font-bold mt-1">{collectionName || "Unknown Collection"}</h3>
              </div>

              {collectionSymbol && (
                <span className="text-xs font-mono text-shift-cyan bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5">
                  {collectionSymbol}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-900/70 rounded-lg p-3">
                <p className="text-xs text-shift-textMuted mb-1">Contract</p>

                <p className="font-mono text-xs break-all text-shift-cyan">{targetContract}</p>
              </div>

              <div className="bg-slate-900/70 rounded-lg p-3">
                <p className="text-xs text-shift-textMuted mb-1">Mint Price</p>

                <p className="font-mono text-shift-lime">{mintPrice} ETH</p>
              </div>

              <div className="bg-slate-900/70 rounded-lg p-3">
                <p className="text-xs text-shift-textMuted mb-1">Quantity</p>

                <p className="font-mono text-white">{maxQuantity}</p>
              </div>
            </div>
          </div>
        )}

        <ActiveSnipesList
          refreshTrigger={refreshTrigger}
          onTaskDisarmed={() => {
            addLog("🛑 Snipe task disarmed by user.");
          }}
          maxTasks={1}
        />

        <LiveTerminal logs={logs} />
      </main>
    </div>
  );
}
