import {
  isAddress,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  type Address,
  type Hex,
  stringToHex,
} from "viem";
import { randomUUID } from "crypto";
import { DEFAULT_CHAIN_ID, getChainConfig } from "@/lib/chains";
import { buildSeaDropPlan } from "@/lib/seadrop";
import { loadActiveTasks, loadTasks, loadTrades, saveTask, saveTrade } from "@/server/sniperStore";
import { getPublicClient } from "@/lib/viem";

// Wait before broadcasting the next higher-fee tier as a same-nonce replacement.
const BUMP_WAIT_MS = 8_000;

// Keep watching after the final tier before giving up.
const FINAL_WAIT_MS = 30_000;

const POLL_INTERVAL_MS = 1_500;

const RPC_BROADCAST_TIMEOUT_MS = 4_000;

const MAX_TRADE_HISTORY = 1_000;

// ERC-721 Transfer event: Transfer(address indexed from, address indexed to, uint256 indexed tokenId).
const ERC721_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a9df523b3ef" as Hex;

const ERC1155_TRANSFER_SINGLE_TOPIC = keccak256(
  stringToHex("TransferSingle(address,address,address,uint256,uint256)"),
);

// Internal status of a sniper task.
export type SniperStatus = "ARMED" | "WAITING" | "BROADCASTING" | "CONFIRMED" | "FAILED" | "CANCELLED";

export interface SnipeTask {
  id: string;

  targetContract: Address;
  transactionTo: Address;

  mintPriceEth: string;
  maxQuantity: number;

  targetFunctionName: string;

  executionMode: "BURNER" | "PRESIGN";

  feeTiers: Hex[];

  scheduledFor: string;
  endsAt?: string;

  rpcUrls: string[];

  // Collection metadata captured when the task is armed.
  collectionName?: string;
  collectionImage?: string;
  collectionSymbol?: string;

  // Runtime state.
  status: SniperStatus;

  statusMessage?: string;

  createdAt: string;
  updatedAt: string;

  signerAddress?: Address;

  broadcastTxHashes: Hex[];

  currentTier?: number;

  errorMessage?: string;
  chainId: number;
}

export interface TradeLog {
  id: string;
  timestamp: string;

  collectionName?: string;
  collectionImage?: string;
  collectionSymbol?: string;

  targetContract: string;

  transactionTo?: string;

  mode: "BURNER" | "PRESIGN";

  requestedQuantity: number;

  mintedQuantity?: number;

  mintPriceEth?: string;

  totalMintCostEth?: string;

  gasUsedEth?: string;

  gasUsed?: string;

  tokenIds?: string[];

  status: "SUCCESS" | "FAILED";

  txHash?: string;

  blockNumber?: string;

  bumpTier?: number;

  signerAddress?: Address;

  errorMessage?: string;
}

const activeTasks = new Map(loadActiveTasks().map((task) => [task.id, task]));

const timers = new Map<string, ReturnType<typeof setTimeout>>();

const taskStatuses = new Map(loadTasks().map((task) => [task.id, task]));

const tradeHistory: TradeLog[] = loadTrades();

let engineStarted = false;

// Helpers

function nowIso() {
  return new Date().toISOString();
}

function updateTask(taskId: string, updates: Partial<SnipeTask>) {
  const task = taskStatuses.get(taskId);

  if (!task) return;

  Object.assign(task, {
    ...updates,
    updatedAt: nowIso(),
  });

  taskStatuses.set(taskId, task);
  saveTask(task, activeTasks.has(taskId));
}

function recordTrade(log: TradeLog) {
  tradeHistory.push(log);
  saveTrade(log, MAX_TRADE_HISTORY);

  if (tradeHistory.length > MAX_TRADE_HISTORY) {
    tradeHistory.splice(0, tradeHistory.length - MAX_TRADE_HISTORY);
  }
}

function createFailedTradeLog(
  task: SnipeTask,
  errorMessage: string,
  options: {
    signerAddress?: Address;
    txHash?: Hex;
  } = {},
): TradeLog {
  return {
    id: task.id,
    timestamp: nowIso(),
    collectionName: task.collectionName,
    collectionSymbol: task.collectionSymbol,
    targetContract: task.targetContract,
    transactionTo: task.transactionTo,
    mode: task.executionMode,
    requestedQuantity: task.maxQuantity,
    mintPriceEth: task.mintPriceEth,
    status: "FAILED",
    txHash: options.txHash,
    signerAddress: options.signerAddress ?? task.signerAddress,
    errorMessage,
  };
}

export function getTradeHistory(): TradeLog[] {
  return [...tradeHistory].reverse();
}

export function getTradeById(tradeId: string): TradeLog | undefined {
  return tradeHistory.find((trade) => trade.id === tradeId);
}

export function getSniperStatus(taskId: string) {
  const task = taskStatuses.get(taskId);

  if (!task) {
    return undefined;
  }

  return {
    id: task.id,

    status: task.status,

    statusMessage: task.statusMessage,

    targetContract: task.targetContract,

    transactionTo: task.transactionTo,

    collectionName: task.collectionName,

    collectionSymbol: task.collectionSymbol,

    collectionImage: task.collectionImage,

    mintPriceEth: task.mintPriceEth,

    requestedQuantity: task.maxQuantity,

    targetFunctionName: task.targetFunctionName,

    executionMode: task.executionMode,

    scheduledFor: task.scheduledFor,

    endsAt: task.endsAt,

    createdAt: task.createdAt,

    updatedAt: task.updatedAt,

    signerAddress: task.signerAddress,

    currentTier: task.currentTier,

    broadcastTxHashes: task.broadcastTxHashes,

    errorMessage: task.errorMessage,

    result: tradeHistory.find((trade) => trade.id === task.id) ?? null,
  };
}

export function getAllSniperStatuses() {
  return Array.from(taskStatuses.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((task) => getSniperStatus(task.id));
}

export function startSniperEngine() {
  if (engineStarted) return;

  engineStarted = true;

  for (const task of activeTasks.values()) {
    scheduleTask(task);
  }

  console.log("[SHIFT BOT] Execution scheduler ready.");
}

// Freshness check

interface FreshnessCheck {
  ok: boolean;
  reason?: string;
  signerAddress?: Address;
}

type TransactionReceipt = Awaited<ReturnType<ReturnType<typeof getPublicClient>["getTransactionReceipt"]>>;
type SerializedTransaction = Parameters<typeof parseTransaction>[0];

// Signed transactions are checked for nonce and balance immediately before broadcasting.
async function verifyTaskFreshness(task: SnipeTask): Promise<FreshnessCheck> {
  try {
    const selectedChainId = task.chainId ?? DEFAULT_CHAIN_ID;
    const client = getPublicClient(selectedChainId);
    const firstSerializedTransaction = task.feeTiers[0] as SerializedTransaction;
    const lastSerializedTransaction = task.feeTiers[task.feeTiers.length - 1] as SerializedTransaction;

    const firstTier = parseTransaction(firstSerializedTransaction);

    const lastTier = parseTransaction(lastSerializedTransaction);

    const signerAddress = await recoverTransactionAddress({
      serializedTransaction: firstSerializedTransaction as Parameters<
        typeof recoverTransactionAddress
      >[0]["serializedTransaction"],
    });

    if (firstTier.nonce === undefined || firstTier.value === undefined) {
      return {
        ok: false,
        reason: "Could not decode the signed transaction.",
      };
    }

    const [currentNonce, balance] = await Promise.all([
      client.getTransactionCount({
        address: signerAddress,
        blockTag: "pending",
      }),

      client.getBalance({
        address: signerAddress,
      }),
    ]);

    if (currentNonce !== firstTier.nonce) {
      return {
        ok: false,
        signerAddress,

        reason:
          `Wallet nonce has moved ` +
          `(signed for ${firstTier.nonce}, ` +
          `chain is now at ${currentNonce}). ` +
          `Another transaction was sent from this wallet since arming — ` +
          `re-sign and re-arm.`,
      };
    }

    if (firstTier.chainId !== selectedChainId) {
      return {
        ok: false,
        signerAddress,
        reason: `Signed transaction targets chain ${firstTier.chainId ?? "an unknown chain"}, expected chain ${selectedChainId}.`,
      };
    }

    const highestMaxFee = lastTier.maxFeePerGas ?? lastTier.gasPrice ?? 0n;

    const requiredBalance = (firstTier.value ?? 0n) + (lastTier.gas ?? 250_000n) * highestMaxFee;

    if (balance < requiredBalance) {
      return {
        ok: false,
        signerAddress,

        reason:
          `Insufficient balance at execution time — ` +
          `has ${balance} wei, needs roughly ` +
          `${requiredBalance} wei to cover the mint plus ` +
          `the top fee-bump tier.`,
      };
    }

    return {
      ok: true,
      signerAddress,
    };
  } catch (error) {
    return {
      ok: false,

      reason: error instanceof Error ? error.message : "Freshness check failed.",
    };
  }
}

// Scheduler

function scheduleTask(task: SnipeTask) {
  const delay = Math.max(0, new Date(task.scheduledFor).getTime() - Date.now());

  updateTask(task.id, {
    status: delay > 0 ? "WAITING" : "ARMED",

    statusMessage:
      delay > 0 ? `Waiting for mint window — scheduled for ${task.scheduledFor}.` : "Sniper armed and ready.",
  });

  const timer = setTimeout(() => void executeSnipe(task.id), Math.min(delay, 2_147_483_647));

  timers.set(task.id, timer);
}

// RPC broadcast

async function broadcastToRpcPool(serializedTransaction: Hex, rpcUrls: string[]) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_sendRawTransaction",
    params: [serializedTransaction],
    id: 1,
  });

  const results = await Promise.allSettled(
    rpcUrls.map(async (url) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RPC_BROADCAST_TIMEOUT_MS);

      try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`RPC returned HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        result?: string;
        error?: {
          message?: string;
        };
      };

      if (payload.result) {
        return {
          txHash: payload.result as Hex,
        };
      }

      const message = payload.error?.message ?? `RPC returned HTTP ${response.status}`;

      if (message.toLowerCase().includes("already known")) {
        return {
          txHash: keccak256(serializedTransaction),
        };
      }

      throw new Error(message);
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  const accepted = results.find(
    (
      result,
    ): result is PromiseFulfilledResult<{
      txHash: Hex;
    }> => result.status === "fulfilled",
  );

  return {
    txHash: accepted?.value.txHash,

    errors: results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason))),
  };
}

// Receipt watcher

async function waitForAnyReceipt(client: ReturnType<typeof getPublicClient>, hashes: Hex[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const hash of hashes) {
      try {
        const receipt = await client.getTransactionReceipt({ hash });

        if (receipt) {
          return receipt;
        }
      } catch {
        // Not mined yet.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return null;
}

// Collection name

async function getCollectionName(client: ReturnType<typeof getPublicClient>, contract: Address): Promise<string | undefined> {
  try {
    const name = await client.readContract({
      address: contract,

      abi: [
        {
          name: "name",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "string",
            },
          ],
        },
      ],

      functionName: "name",
    });

    return name || undefined;
  } catch {
    return undefined;
  }
}

// Collection symbol

async function getCollectionSymbol(client: ReturnType<typeof getPublicClient>, contract: Address): Promise<string | undefined> {
  try {
    const symbol = await client.readContract({
      address: contract,

      abi: [
        {
          name: "symbol",
          type: "function",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "string",
            },
          ],
        },
      ],

      functionName: "symbol",
    });

    return symbol || undefined;
  } catch {
    return undefined;
  }
}

// Extract ERC-721 token IDs transferred to our signer, avoiding NFTs sent away from the wallet.
function extractMintedTokenIds(
  receipt: {
    logs: readonly {
      address: Address;
      topics: readonly Hex[];
      data: Hex;
    }[];
  },
  signerAddress?: Address,
  targetContract?: Address,
): string[] {
  if (!signerAddress) {
    return [];
  }

  const tokenIds: string[] = [];

  const signerTopic = signerAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0");

  for (const log of receipt.logs) {
    if (targetContract && log.address.toLowerCase() !== targetContract.toLowerCase()) {
      continue;
    }

    if (log.topics[0]?.toLowerCase() !== ERC721_TRANSFER_TOPIC.toLowerCase()) {
      if (log.topics[0]?.toLowerCase() !== ERC1155_TRANSFER_SINGLE_TOPIC.toLowerCase()) {
        continue;
      }

      if (log.topics.length < 4 || log.topics[3]?.toLowerCase().replace(/^0x/, "") !== signerTopic) {
        continue;
      }

      const tokenId = log.data?.slice(0, 66);
      if (tokenId) {
        try {
          tokenIds.push(BigInt(tokenId).toString());
        } catch {
          // Ignore malformed token IDs.
        }
      }
      continue;
    }

    if (log.topics.length < 4) {
      continue;
    }

    const toTopic = log.topics[2]?.toLowerCase().replace(/^0x/, "");

    if (toTopic !== signerTopic) {
      continue;
    }

    const tokenId = log.topics[3];

    if (!tokenId) {
      continue;
    }

    try {
      tokenIds.push(BigInt(tokenId).toString());
    } catch {
      // Ignore malformed token IDs.
    }
  }

  return [...new Set(tokenIds)];
}

// Receipt to trade result

async function buildTradeResult(task: SnipeTask, receipt: TransactionReceipt, bumpTier: number): Promise<TradeLog> {
  const successful = receipt.status !== "reverted";

  const tokenIds = successful ? extractMintedTokenIds(receipt, task.signerAddress, task.targetContract) : [];

  // Prefer Transfer events for quantity, falling back to the requested quantity when unavailable.
  const mintedQuantity = tokenIds.length > 0 ? tokenIds.length : successful ? task.maxQuantity : 0;

  const gasUsed = receipt.gasUsed ?? 0n;

  const effectiveGasPrice = receipt.effectiveGasPrice ?? 0n;

  const gasCost = gasUsed * effectiveGasPrice;

  const mintPrice = task.mintPriceEth || "0";

  let totalMintCostEth = "0";

  try {
    const total = BigInt(Math.round(Number(mintPrice) * 1e18 * mintedQuantity));

    totalMintCostEth = formatWeiAsEth(total);
  } catch {
    totalMintCostEth = "0";
  }

  const gasUsedEth = formatWeiAsEth(gasCost);

  const log: TradeLog = {
    id: task.id,

    timestamp: nowIso(),

    collectionName: task.collectionName,

    collectionImage: task.collectionImage,

    collectionSymbol: task.collectionSymbol,

    targetContract: task.targetContract,

    transactionTo: task.transactionTo,

    mode: task.executionMode,

    requestedQuantity: task.maxQuantity,

    mintedQuantity,

    mintPriceEth: mintPrice,

    totalMintCostEth,

    gasUsedEth,

    gasUsed: gasUsed.toString(),

    tokenIds: tokenIds.length > 0 ? tokenIds : undefined,

    status: successful ? "SUCCESS" : "FAILED",

    txHash: receipt.transactionHash,

    blockNumber: receipt.blockNumber?.toString(),

    bumpTier,

    signerAddress: task.signerAddress,

    errorMessage: successful ? undefined : "Transaction was included but reverted on-chain.",
  };

  return log;
}

function formatWeiAsEth(value: bigint): string {
  const negative = value < 0n;

  const absolute = negative ? -value : value;

  const whole = absolute / 1_000_000_000_000_000_000n;

  const fraction = absolute % 1_000_000_000_000_000_000n;

  const fractionString = fraction.toString().padStart(18, "0").replace(/0+$/, "");

  const result = fractionString ? `${whole}.${fractionString}` : whole.toString();

  return negative ? `-${result}` : result;
}

async function executeSnipe(taskId: string) {
  const task = activeTasks.get(taskId);

  if (!task) {
    return;
  }

  if (new Date(task.scheduledFor).getTime() > Date.now()) {
    scheduleTask(task);
    return;
  }

  activeTasks.delete(task.id);

  const client = getPublicClient(task.chainId ?? DEFAULT_CHAIN_ID);

  timers.delete(task.id);

  if (task.endsAt && Date.now() >= new Date(task.endsAt).getTime()) {
    const message = "Mint stage has ended; transaction was not broadcast.";

    updateTask(task.id, {
      status: "FAILED",
      statusMessage: message,
      errorMessage: message,
    });

    recordTrade(createFailedTradeLog(task, message));

    return;
  }

  updateTask(task.id, {
    status: "WAITING",

    statusMessage: "Checking wallet nonce and balance before broadcast.",
  });

  const freshness = await verifyTaskFreshness(task);

  if (!freshness.ok) {
    updateTask(task.id, {
      status: "FAILED",

      statusMessage: freshness.reason,

      errorMessage: freshness.reason,

      signerAddress: freshness.signerAddress,
    });

    recordTrade(
      createFailedTradeLog(task, freshness.reason ?? "Freshness check failed.", {
        signerAddress: freshness.signerAddress,
      }),
    );

    console.warn(`[SHIFT BOT] Task ${task.id} aborted pre-broadcast: ${freshness.reason}`);

    return;
  }

  task.signerAddress = freshness.signerAddress;

  updateTask(task.id, {
    status: "ARMED",

    statusMessage: "Wallet verified. Ready to broadcast.",

    signerAddress: freshness.signerAddress,
  });

  const broadcastHashes: Hex[] = [];

  let lastBroadcastError = "";

  for (let tier = 0; tier < task.feeTiers.length; tier++) {
    updateTask(task.id, {
      status: "BROADCASTING",

      currentTier: tier,

      statusMessage: `Broadcasting fee tier ${tier + 1}/${task.feeTiers.length}...`,
    });

    const { txHash, errors } = await broadcastToRpcPool(task.feeTiers[tier], task.rpcUrls);

    const isLastTier = tier === task.feeTiers.length - 1;

    if (txHash) {
      broadcastHashes.push(txHash);

      updateTask(task.id, {
        status: "BROADCASTING",

        currentTier: tier,

        broadcastTxHashes: broadcastHashes,

        statusMessage: `Transaction broadcast successfully at fee tier ${tier + 1}. TX: ${txHash}`,
      });

      console.log(`[SHIFT BOT] Task ${task.id} tier ${tier} broadcast: ${txHash}`);
    } else {
      lastBroadcastError = errors.join(" | ") || "Every configured RPC rejected the transaction.";

      updateTask(task.id, {
        status: "BROADCASTING",

        currentTier: tier,

        statusMessage: `Fee tier ${tier + 1} rejected: ${lastBroadcastError}`,

        errorMessage: lastBroadcastError,
      });

      console.warn(`[SHIFT BOT] Task ${task.id} tier ${tier} broadcast failed: ${lastBroadcastError}`);

      if (isLastTier && broadcastHashes.length === 0) {
        updateTask(task.id, {
          status: "FAILED",

          statusMessage: `Broadcast failed: ${lastBroadcastError}`,

          errorMessage: lastBroadcastError,
        });

        recordTrade(createFailedTradeLog(task, lastBroadcastError));

        return;
      }

      continue;
    }

    const receipt = await waitForAnyReceipt(client, broadcastHashes, isLastTier ? FINAL_WAIT_MS : BUMP_WAIT_MS);

    if (receipt) {
      const log = await buildTradeResult(task, receipt, tier);

      recordTrade(log);

      if (log.status === "SUCCESS") {
        updateTask(task.id, {
          status: "CONFIRMED",

          statusMessage: `Mint successful — ${log.mintedQuantity ?? 0} NFT(s) minted.`,

          currentTier: tier,

          broadcastTxHashes: broadcastHashes,
        });

        console.log(
          `[SHIFT BOT] Task ${task.id} MINT SUCCESS: ${log.mintedQuantity ?? 0} NFT(s) minted. TX: ${receipt.transactionHash}`,
        );

        if (log.tokenIds && log.tokenIds.length > 0) {
          console.log(`[SHIFT BOT] Task ${task.id} Token IDs: ${log.tokenIds.join(", ")}`);
        }

        console.log(`[SHIFT BOT] Task ${task.id} Mint cost: ${log.totalMintCostEth} ETH | Gas: ${log.gasUsedEth} ETH`);
      } else {
        updateTask(task.id, {
          status: "FAILED",

          statusMessage: "Transaction was confirmed but reverted on-chain.",

          currentTier: tier,

          broadcastTxHashes: broadcastHashes,

          errorMessage: log.errorMessage,
        });

        console.warn(`[SHIFT BOT] Task ${task.id} transaction reverted: ${receipt.transactionHash}`);
      }

      return;
    }

    if (!isLastTier) {
      updateTask(task.id, {
        status: "BROADCASTING",

        currentTier: tier + 1,

        broadcastTxHashes: broadcastHashes,

        statusMessage: `Tier ${tier + 1} not confirmed within ${BUMP_WAIT_MS}ms — preparing fee bump.`,
      });

      console.log(
        `[SHIFT BOT] Task ${task.id} tier ${tier} not confirmed within ${BUMP_WAIT_MS}ms — bumping to tier ${tier + 1}.`,
      );
    }
  }

  const finalError =
    broadcastHashes.length > 0 ? "Broadcast on every fee tier, but none confirmed in time." : lastBroadcastError;

  updateTask(task.id, {
    status: "FAILED",

    statusMessage: finalError,

    errorMessage: finalError,

    broadcastTxHashes: broadcastHashes,
  });

  recordTrade(
    createFailedTradeLog(task, finalError, {
      txHash: broadcastHashes[broadcastHashes.length - 1],
    }),
  );
}

export async function armSniper(
  contract: string,
  price: string,
  qty: number,
  fnName: string,
  mode: "BURNER" | "PRESIGN",
  feeTiers: string[],
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<string> {
  startSniperEngine();

  if (!isAddress(contract)) {
    throw new Error("A valid NFT contract address is required.");
  }

  if (!Number.isInteger(qty) || qty < 1) {
    throw new Error("Quantity must be a positive whole number.");
  }

  if (!feeTiers || feeTiers.length === 0) {
    throw new Error("At least one signed transaction tier is required.");
  }

  const targetContract = contract as Address;
  const chainConfig = getChainConfig(chainId);
  const client = getPublicClient(chainConfig.id);

  // Get SeaDrop information.
  const seaDropPlan = await buildSeaDropPlan(client, targetContract, qty);

  if (seaDropPlan?.endsAt && seaDropPlan.endsAt <= Date.now()) {
    throw new Error("This SeaDrop public mint has already ended.");
  }

  const transactionTo = seaDropPlan?.to ?? targetContract;

  const startAt = seaDropPlan?.startsAt && seaDropPlan.startsAt > Date.now() ? seaDropPlan.startsAt : Date.now();

  // Inspect collection metadata.
  const [collectionName, collectionSymbol] = await Promise.all([
    getCollectionName(client, targetContract),

    getCollectionSymbol(client, targetContract),
  ]);

  const taskId = randomUUID();

  const createdAt = nowIso();

  const signerAddress = await recoverTransactionAddress({
    serializedTransaction: feeTiers[0] as Parameters<typeof recoverTransactionAddress>[0]["serializedTransaction"],
  });

  const task: SnipeTask = {
    id: taskId,

    chainId: chainConfig.id,

    targetContract,

    transactionTo,

    mintPriceEth: seaDropPlan?.mintPriceEth ?? price,

    maxQuantity: qty,

    targetFunctionName: seaDropPlan ? "mintPublic" : fnName,

    executionMode: mode,

    feeTiers: feeTiers as Hex[],

    scheduledFor: new Date(startAt).toISOString(),

    endsAt: seaDropPlan?.endsAt ? new Date(seaDropPlan.endsAt).toISOString() : undefined,

    rpcUrls: [chainConfig.rpcUrl, ...chainConfig.fallbackRpcUrls],

    collectionName,

    collectionSymbol,

    signerAddress,

    status: startAt > Date.now() ? "WAITING" : "ARMED",

    statusMessage:
      startAt > Date.now()
        ? `Waiting for mint window — scheduled for ${new Date(startAt).toISOString()}.`
        : "Sniper armed and ready.",

    createdAt,

    updatedAt: createdAt,

    broadcastTxHashes: [],
  };

  activeTasks.set(task.id, task);

  taskStatuses.set(task.id, task);

  scheduleTask(task);

  console.log(
    `[SHIFT BOT] Task ${task.id} armed — ${collectionName ?? "Unknown Collection"} — quantity ${qty} — price ${task.mintPriceEth} ETH`,
  );

  return task.id;
}

export function retrySniper(taskId: string): string | undefined {
  const original = taskStatuses.get(taskId);

  if (!original || original.status !== "FAILED" || original.feeTiers.length === 0) {
    return undefined;
  }

  const retryId = randomUUID();
  const createdAt = nowIso();
  const retryTask: SnipeTask = {
    ...original,
    id: retryId,
    status: "ARMED",
    statusMessage: "Retry task armed. Rechecking wallet freshness before broadcast.",
    errorMessage: undefined,
    currentTier: undefined,
    broadcastTxHashes: [],
    createdAt,
    updatedAt: createdAt,
  };

  taskStatuses.set(retryId, retryTask);
  activeTasks.set(retryId, retryTask);
  scheduleTask(retryTask);
  return retryId;
}

export async function armSniperBatch(
  contract: string,
  price: string,
  qty: number,
  fnName: string,
  mode: "BURNER" | "PRESIGN",
  feeTiersBatch: string[][],
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<string[]> {
  const batches = (feeTiersBatch ?? []).filter((tiers) => Array.isArray(tiers) && tiers.length > 0);

  if (batches.length === 0) {
    throw new Error("At least one signed transaction is required.");
  }

  const taskIds: string[] = [];

  try {
    for (const feeTiers of batches) {
      taskIds.push(await armSniper(contract, price, qty, fnName, mode, feeTiers, chainId));
    }

    return taskIds;
  } catch (error) {
    for (const taskId of taskIds) {
      disarmSniper(taskId);
    }

    throw error;
  }
}

export function disarmSniper(taskId: string): boolean {
  const timer = timers.get(taskId);

  if (timer) {
    clearTimeout(timer);
  }

  timers.delete(taskId);

  const task = taskStatuses.get(taskId);

  if (task) {
    updateTask(taskId, {
      status: "CANCELLED",

      statusMessage: "Sniper task cancelled by user.",
    });
  }

  return activeTasks.delete(taskId);
}

export function getActiveTasks() {
  return Array.from(activeTasks.values()).map((task) => ({
    id: task.id,

    chainId: task.chainId,

    chainName: getChainConfig(task.chainId ?? DEFAULT_CHAIN_ID).label,

    targetContract: task.targetContract,

    transactionTo: task.transactionTo,

    mintPriceEth: task.mintPriceEth,

    maxQuantity: task.maxQuantity,

    targetFunctionName: task.targetFunctionName,

    executionMode: task.executionMode,

    feeTierCount: task.feeTiers.length,

    scheduledFor: task.scheduledFor,

    endsAt: task.endsAt,

    rpcCount: task.rpcUrls.length,

    collectionName: task.collectionName,

    collectionSymbol: task.collectionSymbol,

    status: task.status,

    statusMessage: task.statusMessage,

    currentTier: task.currentTier,

    signerAddress: task.signerAddress,

    createdAt: task.createdAt,

    updatedAt: task.updatedAt,

    broadcastTxHashes: task.broadcastTxHashes,
  }));
}

startSniperEngine();
