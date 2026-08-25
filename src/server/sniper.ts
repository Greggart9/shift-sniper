import { createPublicClient, createWalletClient, encodeFunctionData, http, isAddress, keccak256, parseEther, parseGwei, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { randomUUID } from 'crypto';
import { robinhoodChain } from '@/lib/viem';

const RPC_URL = process.env.ROBINHOOD_CHAIN_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com';
const DEFAULT_RPC_URLS = [RPC_URL, 'https://sequencer.mainnet.chain.robinhood.com'];
const SEADROP_ADDRESS = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5' as Address;
const OPENSEA_FEE_RECIPIENT = '0x0000a26b00c1F0DF003000390027140000fAa719' as Address;
const GAS_LIMIT = 250_000n;
const publicClient = createPublicClient({ chain: robinhoodChain, transport: http(RPC_URL) });

const seaDropAbi = [
  { name: 'getPublicDrop', type: 'function', stateMutability: 'view', inputs: [{ name: 'nftContract', type: 'address' }], outputs: [{ type: 'tuple', components: [{ name: 'mintPrice', type: 'uint80' }, { name: 'startTime', type: 'uint48' }, { name: 'endTime', type: 'uint48' }, { name: 'maxTotalMintableByWallet', type: 'uint16' }, { name: 'feeBps', type: 'uint16' }, { name: 'restrictFeeRecipients', type: 'bool' }] }] },
  { name: 'getAllowedFeeRecipients', type: 'function', stateMutability: 'view', inputs: [{ name: 'nftContract', type: 'address' }], outputs: [{ type: 'address[]' }] },
  { name: 'mintPublic', type: 'function', stateMutability: 'payable', inputs: [{ name: 'nftContract', type: 'address' }, { name: 'feeRecipient', type: 'address' }, { name: 'minterIfNotPayer', type: 'address' }, { name: 'quantity', type: 'uint256' }], outputs: [] },
] as const;

type PublicDrop = { mintPrice: bigint; startTime: bigint; endTime: bigint; maxTotalMintableByWallet: bigint; restrictFeeRecipients: boolean };

export interface SnipeTask {
  id: string;
  targetContract: Address;
  transactionTo: Address;
  mintPriceEth: string;
  maxQuantity: number;
  targetFunctionName: string;
  executionMode: 'BURNER' | 'PRESIGN';
  serializedTransaction: Hex;
  maxFeeGwei?: string;
  priorityTipGwei?: string;
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

async function readSeaDropPlan(nftContract: Address, quantity: number) {
  try {
    const rawDrop = await publicClient.readContract({ address: SEADROP_ADDRESS, abi: seaDropAbi, functionName: 'getPublicDrop', args: [nftContract] });
    const drop = rawDrop as unknown as PublicDrop;
    if (drop.startTime === 0n && drop.endTime === 0n && drop.maxTotalMintableByWallet === 0n) return null;
    if (quantity > Number(drop.maxTotalMintableByWallet)) throw new Error(`Quantity exceeds this drop's ${drop.maxTotalMintableByWallet} per-wallet limit.`);
    const allowed = await publicClient.readContract({ address: SEADROP_ADDRESS, abi: seaDropAbi, functionName: 'getAllowedFeeRecipients', args: [nftContract] });
    const feeRecipient = allowed[0] ?? (drop.restrictFeeRecipients ? undefined : OPENSEA_FEE_RECIPIENT);
    if (!feeRecipient) throw new Error('This SeaDrop collection has no allowed fee recipient.');
    return {
      to: SEADROP_ADDRESS,
      data: encodeFunctionData({ abi: seaDropAbi, functionName: 'mintPublic', args: [nftContract, feeRecipient, '0x0000000000000000000000000000000000000000', BigInt(quantity)] }),
      value: drop.mintPrice * BigInt(quantity),
      startsAt: Number(drop.startTime) * 1_000,
      endsAt: Number(drop.endTime) * 1_000,
      mintPriceEth: (Number(drop.mintPrice) / 1e18).toString(),
    };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('per-wallet limit') || error.message.includes('allowed fee recipient'))) throw error;
    return null;
  }
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

export async function armSniper(contract: string, price: string, qty: number, fnName: string, mode: 'BURNER' | 'PRESIGN', privateKey?: string, signedPayload?: string, maxFeeGwei?: string, priorityTipGwei?: string): Promise<string> {
  startSniperEngine();
  if (!isAddress(contract)) throw new Error('A valid NFT contract address is required.');
  if (!Number.isInteger(qty) || qty < 1) throw new Error('Quantity must be a positive whole number.');
  const targetContract = contract as Address;
  const seaDropPlan = await readSeaDropPlan(targetContract, qty);
  if (seaDropPlan?.endsAt && seaDropPlan.endsAt <= Date.now()) {
    throw new Error('This SeaDrop public mint has already ended.');
  }
  if (seaDropPlan && mode === 'PRESIGN') {
    throw new Error('SeaDrop public mints must use Burner mode so the server can pre-sign the on-chain mintPublic transaction.');
  }
  const transactionTo = seaDropPlan?.to ?? targetContract;
  const data = seaDropPlan?.data ?? encodeFunctionData({ abi: [{ name: fnName, type: 'function', stateMutability: 'payable', inputs: [{ name: 'quantity', type: 'uint256' }], outputs: [] }], functionName: fnName, args: [BigInt(qty)] });
  const value = seaDropPlan?.value ?? parseEther(price);
  const startAt = seaDropPlan?.startsAt && seaDropPlan.startsAt > Date.now() ? seaDropPlan.startsAt : Date.now();
  let serializedTransaction: Hex;

  if (mode === 'BURNER') {
    if (!privateKey) throw new Error('An active burner wallet is required.');
    const account = privateKeyToAccount(privateKey as Hex);
    const maxFeePerGas = parseGwei(maxFeeGwei ?? '25');
    const maxPriorityFeePerGas = parseGwei(priorityTipGwei ?? '5');
    if (maxPriorityFeePerGas > maxFeePerGas) throw new Error('Priority tip cannot exceed the max fee.');
    const [nonce, chainId, balance] = await Promise.all([
      publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' }),
      publicClient.getChainId(),
      publicClient.getBalance({ address: account.address }),
    ]);
    if (balance < value + GAS_LIMIT * maxFeePerGas) throw new Error('Burner wallet cannot cover the mint value and maximum gas reservation.');
    const walletClient = createWalletClient({ account, chain: robinhoodChain, transport: http(RPC_URL) });
    serializedTransaction = await walletClient.signTransaction({ account, to: transactionTo, data, value, nonce, chainId, gas: GAS_LIMIT, maxFeePerGas, maxPriorityFeePerGas, type: 'eip1559' });
  } else {
    if (!signedPayload) throw new Error('A signed transaction is required for pre-sign mode.');
    serializedTransaction = signedPayload as Hex;
  }

  const task: SnipeTask = { id: randomUUID(), targetContract, transactionTo, mintPriceEth: seaDropPlan?.mintPriceEth ?? price, maxQuantity: qty, targetFunctionName: seaDropPlan ? 'mintPublic' : fnName, executionMode: mode, serializedTransaction, maxFeeGwei, priorityTipGwei, scheduledFor: new Date(startAt).toISOString(), endsAt: seaDropPlan?.endsAt ? new Date(seaDropPlan.endsAt).toISOString() : undefined, rpcUrls: DEFAULT_RPC_URLS };
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
  privateKeys?: string[],
  signedPayload?: string,
  maxFeeGwei?: string,
  priorityTipGwei?: string,
): Promise<string[]> {
  const keys = mode === 'BURNER' ? [...new Set(privateKeys?.filter(Boolean) ?? [])] : [undefined];
  if (keys.length === 0) throw new Error('At least one burner wallet is required.');
  return Promise.all(keys.map((privateKey) => armSniper(contract, price, qty, fnName, mode, privateKey, signedPayload, maxFeeGwei, priorityTipGwei)));
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
    maxFeeGwei: task.maxFeeGwei, priorityTipGwei: task.priorityTipGwei,
    scheduledFor: task.scheduledFor, endsAt: task.endsAt, rpcCount: task.rpcUrls.length,
  }));
}
