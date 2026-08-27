import { createPublicClient, http, isAddress, keccak256, parseTransaction, recoverTransactionAddress, type Address, type Hex } from 'viem';
import { randomUUID } from 'crypto';
import { robinhoodChain } from '@/lib/viem';
import { buildSeaDropPlan } from '@/lib/seadrop';

const RPC_URL = process.env.ROBINHOOD_CHAIN_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com';
const DEFAULT_RPC_URLS = [RPC_URL, 'https://sequencer.mainnet.chain.robinhood.com'];
const publicClient = createPublicClient({ chain: robinhoodChain, transport: http(RPC_URL) });

// How long to wait for a tier to confirm before broadcasting the next
// (higher-fee) tier as a same-nonce replacement.
const BUMP_WAIT_MS = 8_000;
// How long to keep watching after the final tier before giving up.
const FINAL_WAIT_MS = 30_000;
const POLL_INTERVAL_MS = 1_500;

export interface SnipeTask {
  id: string;
  targetContract: Address;
  transactionTo: Address;
  mintPriceEth: string;
  maxQuantity: number;
  targetFunctionName: string;
  executionMode: 'BURNER' | 'PRESIGN';
  feeTiers: Hex[];
  scheduledFor: string;
  endsAt?: string;
  rpcUrls: string[];
}

export interface TradeLog {
  id: string; timestamp: string; targetContract: string; mode: SnipeTask['executionMode'];
  status: 'SUCCESS' | 'FAILED'; txHash?: string; errorMessage?: string; blockNumber?: string; bumpTier?: number;
  signerAddress?: Address;
}

const activeTasks = new Map<string, SnipeTask>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const tradeHistory: TradeLog[] = [];
const MAX_TRADE_HISTORY = 1_000;
let engineStarted = false;

function recordTrade(log: TradeLog) {
  tradeHistory.push(log);
  if (tradeHistory.length > MAX_TRADE_HISTORY) tradeHistory.splice(0, tradeHistory.length - MAX_TRADE_HISTORY);
}

export function getTradeHistory(): TradeLog[] { return [...tradeHistory].reverse(); }

export function startSniperEngine() {
  if (engineStarted) return;
  engineStarted = true;
  console.log('[SHIFT BOT] Execution scheduler ready.');
}
interface FreshnessCheck {
  ok: boolean;
  reason?: string;
  signerAddress?: Address;
}

/**
 * Transactions here are signed well before execution — sometimes hours
 * ahead. Between signing and broadcast, the wallet's nonce or balance can
 * drift (another tx sent, funds moved). We can't re-sign without the key,
 * but we can catch a doomed broadcast before wasting the mint window on it.
 */
async function verifyTaskFreshness(task: SnipeTask): Promise<FreshnessCheck> {
  try {
    const firstTier = parseTransaction(task.feeTiers[0]);
    const lastTier = parseTransaction(task.feeTiers[task.feeTiers.length - 1]);
    const signerAddress = await recoverTransactionAddress({ serializedTransaction: task.feeTiers[0] });

    if (firstTier.nonce === undefined || firstTier.value === undefined) {
      return { ok: false, reason: 'Could not decode the signed transaction.' };
    }

    const [currentNonce, balance] = await Promise.all([
      publicClient.getTransactionCount({ address: signerAddress, blockTag: 'pending' }),
      publicClient.getBalance({ address: signerAddress }),
    ]);

    if (currentNonce !== firstTier.nonce) {
      return {
        ok: false,
        signerAddress,
        reason: `Wallet nonce has moved (signed for ${firstTier.nonce}, chain is now at ${currentNonce}). Another transaction was sent from this wallet since arming — re-sign and re-arm.`,
      };
    }

    const highestMaxFee = lastTier.maxFeePerGas ?? lastTier.gasPrice ?? 0n;
    const requiredBalance = (firstTier.value ?? 0n) + (lastTier.gas ?? 250_000n) * highestMaxFee;
    if (balance < requiredBalance) {
      return {
        ok: false,
        signerAddress,
        reason: `Insufficient balance at execution time — has ${balance} wei, needs roughly ${requiredBalance} wei to cover the mint plus the top fee-bump tier.`,
      };
    }

    return { ok: true, signerAddress };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Freshness check failed.' };
  }
}

function scheduleTask(task: SnipeTask) {
  const delay = Math.max(0, new Date(task.scheduledFor).getTime() - Date.now());
  const timer = setTimeout(() => void executeSnipe(task.id), Math.min(delay, 2_147_483_647));
  timers.set(task.id, timer);
}

async function broadcastToRpcPool(serializedTransaction: Hex, rpcUrls: string[]) {
  const body = JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [serializedTransaction], id: 1 });
  const results = await Promise.allSettled(rpcUrls.map(async (url) => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    const payload = await response.json() as { result?: string; error?: { message?: string } };
    if (payload.result) return { txHash: payload.result as Hex };
    const message = payload.error?.message ?? `RPC returned HTTP ${response.status}`;
    if (message.toLowerCase().includes('already known')) return { txHash: keccak256(serializedTransaction) };
    throw new Error(message);
  }));
  const accepted = results.find((result): result is PromiseFulfilledResult<{ txHash: Hex }> => result.status === 'fulfilled');
  return {
    txHash: accepted?.value.txHash,
    errors: results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason)),
  };
}

/** Polls a set of candidate tx hashes (one per fee tier broadcast so far)
 * for a mined receipt. Only one tier can ever actually confirm, since they
 * share a nonce — whichever lands first wins and cancels the rest. */
async function waitForAnyReceipt(hashes: Hex[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const hash of hashes) {
      try {
        const receipt = await publicClient.getTransactionReceipt({ hash });
        if (receipt) return receipt;
      } catch {
        // Not mined yet — keep polling.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return null;
}

async function executeSnipe(taskId: string) {
  const task = activeTasks.get(taskId);
  if (!task) return;
  if (new Date(task.scheduledFor).getTime() > Date.now()) return scheduleTask(task);
  activeTasks.delete(task.id);
  timers.delete(task.id);
  if (task.endsAt && Date.now() >= new Date(task.endsAt).getTime()) {
    recordTrade({
      id: task.id, timestamp: new Date().toISOString(), targetContract: task.targetContract,
      mode: task.executionMode, status: 'FAILED', errorMessage: 'Mint stage has ended; transaction was not broadcast.',
    });
    return;
  }

  const broadcastHashes: Hex[] = [];
  let lastBroadcastError = '';

    const freshness = await verifyTaskFreshness(task);
  if (!freshness.ok) {
    recordTrade({
      id: task.id, timestamp: new Date().toISOString(), targetContract: task.targetContract,
      mode: task.executionMode, status: 'FAILED', errorMessage: freshness.reason, signerAddress: freshness.signerAddress,
    });
    console.warn(`[SHIFT BOT] Task ${task.id} aborted pre-broadcast: ${freshness.reason}`);
    return;
  }

  for (let tier = 0; tier < task.feeTiers.length; tier++) {
    const { txHash, errors } = await broadcastToRpcPool(task.feeTiers[tier], task.rpcUrls);
    const isLastTier = tier === task.feeTiers.length - 1;

    if (txHash) {
      broadcastHashes.push(txHash);
      console.log(`[SHIFT BOT] Task ${task.id} tier ${tier} broadcast: ${txHash}`);
    } else {
      lastBroadcastError = errors.join(' | ') || 'Every configured RPC rejected the transaction.';
      console.warn(`[SHIFT BOT] Task ${task.id} tier ${tier} broadcast failed: ${lastBroadcastError}`);
      if (isLastTier && broadcastHashes.length === 0) {
        recordTrade({ id: task.id, timestamp: new Date().toISOString(), targetContract: task.targetContract, mode: task.executionMode, status: 'FAILED', errorMessage: lastBroadcastError });
        return;
      }
      continue; // this tier was rejected outright — try the next tier immediately
    }

    const receipt = await waitForAnyReceipt(broadcastHashes, isLastTier ? FINAL_WAIT_MS : BUMP_WAIT_MS);
    if (receipt) {
      const log: TradeLog = {
        id: task.id, timestamp: new Date().toISOString(), targetContract: task.targetContract,
        mode: task.executionMode, status: receipt.status === 'reverted' ? 'FAILED' : 'SUCCESS',
        txHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString(), bumpTier: tier,
        signerAddress: freshness.signerAddress,
        errorMessage: receipt.status === 'reverted' ? 'Transaction was included but reverted on-chain.' : undefined,
      };
      recordTrade(log);
      console.log(`[SHIFT BOT] Task ${task.id} confirmed at tier ${tier}: ${receipt.transactionHash}`);
      return;
    }
    if (!isLastTier) {
      console.log(`[SHIFT BOT] Task ${task.id} tier ${tier} not confirmed within ${BUMP_WAIT_MS}ms — bumping to tier ${tier + 1}.`);
    }
  }

  recordTrade({
    id: task.id, timestamp: new Date().toISOString(), targetContract: task.targetContract,
    mode: task.executionMode, status: 'FAILED',
    errorMessage: broadcastHashes.length > 0 ? 'Broadcast on every fee tier, but none confirmed in time.' : lastBroadcastError,
  });
}

export async function armSniper(
  contract: string,
  price: string,
  qty: number,
  fnName: string,
  mode: 'BURNER' | 'PRESIGN',
  feeTiers: string[],
): Promise<string> {
  startSniperEngine();
  if (!isAddress(contract)) throw new Error('A valid NFT contract address is required.');
  if (!Number.isInteger(qty) || qty < 1) throw new Error('Quantity must be a positive whole number.');
  if (!feeTiers || feeTiers.length === 0) throw new Error('At least one signed transaction tier is required.');

  const targetContract = contract as Address;
  const seaDropPlan = await buildSeaDropPlan(publicClient, targetContract, qty);
  if (seaDropPlan?.endsAt && seaDropPlan.endsAt <= Date.now()) {
    throw new Error('This SeaDrop public mint has already ended.');
  }

  const transactionTo = seaDropPlan?.to ?? targetContract;
  const startAt = seaDropPlan?.startsAt && seaDropPlan.startsAt > Date.now() ? seaDropPlan.startsAt : Date.now();

  const task: SnipeTask = {
    id: randomUUID(),
    targetContract,
    transactionTo,
    mintPriceEth: seaDropPlan?.mintPriceEth ?? price,
    maxQuantity: qty,
    targetFunctionName: seaDropPlan ? 'mintPublic' : fnName,
    executionMode: mode,
    feeTiers: feeTiers as Hex[],
    scheduledFor: new Date(startAt).toISOString(),
    endsAt: seaDropPlan?.endsAt ? new Date(seaDropPlan.endsAt).toISOString() : undefined,
    rpcUrls: DEFAULT_RPC_URLS,
  };
  activeTasks.set(task.id, task);
  scheduleTask(task);
  return task.id;
}

export async function armSniperBatch(
  contract: string,
  price: string,
  qty: number,
  fnName: string,
  mode: 'BURNER' | 'PRESIGN',
  feeTiersBatch: string[][],
): Promise<string[]> {
  const batches = (feeTiersBatch ?? []).filter((tiers) => Array.isArray(tiers) && tiers.length > 0);
  if (batches.length === 0) throw new Error('At least one signed transaction is required.');
  return Promise.all(batches.map((feeTiers) => armSniper(contract, price, qty, fnName, mode, feeTiers)));
}

export function disarmSniper(taskId: string): boolean {
  const timer = timers.get(taskId);
  if (timer) clearTimeout(timer);
  timers.delete(taskId);
  return activeTasks.delete(taskId);
}

export function getActiveTasks() {
  return Array.from(activeTasks.values()).map((task) => ({
    id: task.id, targetContract: task.targetContract, transactionTo: task.transactionTo,
    mintPriceEth: task.mintPriceEth, maxQuantity: task.maxQuantity,
    targetFunctionName: task.targetFunctionName, executionMode: task.executionMode,
    feeTierCount: task.feeTiers.length,
    scheduledFor: task.scheduledFor, endsAt: task.endsAt, rpcCount: task.rpcUrls.length,
  }));
}