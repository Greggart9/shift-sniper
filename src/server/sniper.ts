import { createPublicClient, http, isAddress, keccak256, type Address, type Hex } from 'viem';
import { randomUUID } from 'crypto';
import { robinhoodChain } from '@/lib/viem';
import { buildSeaDropPlan } from '@/lib/seadrop';

const RPC_URL = process.env.ROBINHOOD_CHAIN_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com';
const DEFAULT_RPC_URLS = [RPC_URL, 'https://sequencer.mainnet.chain.robinhood.com'];
const publicClient = createPublicClient({ chain: robinhoodChain, transport: http(RPC_URL) });

export interface SnipeTask {
  id: string;
  targetContract: Address;
  transactionTo: Address;
  mintPriceEth: string;
  maxQuantity: number;
  targetFunctionName: string;
  executionMode: 'BURNER' | 'PRESIGN';
  serializedTransaction: Hex;
  scheduledFor: string;
  endsAt?: string;
  rpcUrls: string[];
}

export interface TradeLog {
  id: string; timestamp: string; targetContract: string; mode: SnipeTask['executionMode'];
  status: 'SUCCESS' | 'FAILED'; txHash?: string; errorMessage?: string; blockNumber?: string;
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

function scheduleTask(task: SnipeTask) {
  const delay = Math.max(0, new Date(task.scheduledFor).getTime() - Date.now());
  const timer = setTimeout(() => void executeSnipe(task.id), Math.min(delay, 2_147_483_647));
  timers.set(task.id, timer);
}

async function executeSnipe(taskId: string) {
  const task = activeTasks.get(taskId);
  if (!task) return;
  if (new Date(task.scheduledFor).getTime() > Date.now()) return scheduleTask(task);
  activeTasks.delete(task.id);
  timers.delete(task.id);
  if (task.endsAt && Date.now() >= new Date(task.endsAt).getTime()) {
    recordTrade({
      id: task.id,
      timestamp: new Date().toISOString(),
      targetContract: task.targetContract,
      mode: task.executionMode,
      status: 'FAILED',
      errorMessage: 'Mint stage has ended; transaction was not broadcast.',
    });
    return;
  }
  try {
    const { txHash, errors } = await broadcastToRpcPool(task.serializedTransaction, task.rpcUrls);
    if (!txHash) throw new Error(errors.join(' | ') || 'Every configured RPC rejected the transaction.');
    const log: TradeLog = { id: task.id, timestamp: new Date().toISOString(), targetContract: task.targetContract, mode: task.executionMode, status: 'SUCCESS', txHash };
    recordTrade(log);
    void trackReceipt(log, txHash);
    console.log(`[SHIFT BOT] Task ${task.id} broadcasted: ${txHash}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
    recordTrade({ id: task.id, timestamp: new Date().toISOString(), targetContract: task.targetContract, mode: task.executionMode, status: 'FAILED', errorMessage });
    console.error(`[SHIFT BOT] Task ${task.id} execution error:`, error);
  }
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

async function trackReceipt(log: TradeLog, txHash: Hex) {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000, pollingInterval: 1_000 });
    log.blockNumber = receipt.blockNumber.toString();
    if (receipt.status === 'reverted') {
      log.status = 'FAILED';
      log.errorMessage = 'Transaction was included but reverted on-chain.';
    }
  } catch {
    // The transaction may still be pending; its successful broadcast remains logged.
  }
}

export async function armSniper(
  contract: string,
  price: string,
  qty: number,
  fnName: string,
  mode: 'BURNER' | 'PRESIGN',
  signedPayload: string,
): Promise<string> {
  startSniperEngine();
  if (!isAddress(contract)) throw new Error('A valid NFT contract address is required.');
  if (!Number.isInteger(qty) || qty < 1) throw new Error('Quantity must be a positive whole number.');
  if (!signedPayload) throw new Error('A signed transaction is required. Sign it in your browser before submitting.');

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
    serializedTransaction: signedPayload as Hex,
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
  signedPayloads: string[],
): Promise<string[]> {
  const payloads = [...new Set((signedPayloads ?? []).filter(Boolean))];
  if (payloads.length === 0) throw new Error('At least one signed transaction is required.');
  return Promise.all(payloads.map((signedPayload) => armSniper(contract, price, qty, fnName, mode, signedPayload)));
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
    scheduledFor: task.scheduledFor, endsAt: task.endsAt, rpcCount: task.rpcUrls.length,
  }));
}