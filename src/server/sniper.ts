import { 
  createWalletClient, 
  createPublicClient, 
  webSocket, 
  parseEther, 
  defineChain 
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { randomUUID } from 'crypto';

const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  network: 'robinhood-mainnet',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  rpcUrls: {
    default: { 
      http: ['https://rpc.mainnet.chain.robinhood.com'],
      webSocket: ['wss://robinhood-mainnet.gateway.tatum.io'] 
    },
    public: { 
      http: ['https://rpc.mainnet.chain.robinhood.com'] 
    },
  },
});

const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: webSocket('wss://robinhood-mainnet.gateway.tatum.io', {
    keepAlive: true,
    reconnect: true,
  })
});

export interface SnipeTask {
  id: string;
  targetContract: `0x${string}`;
  mintPriceEth: string;
  maxQuantity: number;
  targetFunctionName: string;
  executionMode: 'BURNER' | 'PRESIGN';
  burnerPrivateKey: `0x${string}` | null;
  presignedPayload: `0x${string}` | null;
}

const activeTasks = new Map<string, SnipeTask>();

export async function startSniperEngine() {
  console.log('🦎 [SHIFT BOT] Multi-Task Engine with Pre-Flight Simulation active...');

  publicClient.watchBlockNumber({
    onBlockNumber: async (blockNumber) => {
      if (activeTasks.size === 0) return;

      console.log(`[${new Date().toLocaleTimeString()}] Block ${blockNumber} - checking ${activeTasks.size} active tasks...`);
      
      try {
        const executionPromises = Array.from(activeTasks.values()).map(task => executeSnipe(task));
        await Promise.allSettled(executionPromises);
      } catch (error) {
        console.error('Block processing error:', error);
      }
    },
    onError: (error) => console.error('WebSocket Error:', error)
  });
}

async function executeSnipe(task: SnipeTask) {
  activeTasks.delete(task.id);
  console.log(`⚡ [SHIFT BOT] Mint block detected! Executing Task [${task.id}] via ${task.executionMode} mode...`);

  try {
    if (task.executionMode === 'BURNER' && task.burnerPrivateKey) {
      const account = privateKeyToAccount(task.burnerPrivateKey);
      const walletClient = createWalletClient({
        account,
        chain: robinhoodChain,
        transport: webSocket('wss://robinhood-mainnet.gateway.tatum.io')
      });

      const abiItem = [{
        name: task.targetFunctionName, 
        type: 'function',
        stateMutability: 'payable',
        inputs: [{ name: 'quantity', type: 'uint256' }],
        outputs: []
      } as const];

      // --- PRE-FLIGHT SIMULATION CHECK ---
      try {
        await publicClient.simulateContract({
          address: task.targetContract,
          abi: abiItem,
          functionName: task.targetFunctionName,
          args: [BigInt(task.maxQuantity)],
          value: parseEther(task.mintPriceEth),
          account: account.address,
        });
        console.log(`🔍 [PRE-FLIGHT] Simulation passed for Task [${task.id}]. Broadcasting...`);
      } catch (simError: any) {
        console.warn(`⚠️ [PRE-FLIGHT] Simulation failed for Task [${task.id}]. Contract would revert:`, simError.shortMessage || simError.message);
        return; // Abort broadcast to save user gas fees
      }

      // Execute actual transaction
      const txHash = await walletClient.writeContract({
        address: task.targetContract,
        abi: abiItem,
        functionName: task.targetFunctionName,
        args: [BigInt(task.maxQuantity)],
        value: parseEther(task.mintPriceEth),
        gas: 300000n 
      });

      console.log(`✅ [SHIFT BOT] Burner Snipe Submitted! Task: ${task.id} | Tx: ${txHash}`);
      
    } else if (task.executionMode === 'PRESIGN' && task.presignedPayload) {
      const txHash = await publicClient.sendRawTransaction({
        serializedTransaction: task.presignedPayload
      });
      
      console.log(`✅ [SHIFT BOT] Pre-Signed Snipe Broadcasted! Task: ${task.id} | Tx: ${txHash}`);
    }

  } catch (error) {
    console.error(`❌ [SHIFT BOT] Task ${task.id} execution failed:`, error);
  }
}

export function armSniper(
  contract: string, 
  price: string, 
  qty: number, 
  fnName: string,
  mode: 'BURNER' | 'PRESIGN',
  privateKey?: string,
  signedPayload?: string
): string {
  const taskId = randomUUID();

  const newTask: SnipeTask = {
    id: taskId,
    targetContract: contract as `0x${string}`,
    mintPriceEth: price,
    maxQuantity: qty,
    targetFunctionName: fnName,
    executionMode: mode,
    burnerPrivateKey: mode === 'BURNER' && privateKey ? privateKey as `0x${string}` : null,
    presignedPayload: mode === 'PRESIGN' && signedPayload ? signedPayload as `0x${string}` : null,
  };

  activeTasks.set(taskId, newTask);
  console.log(`🎯 [SHIFT BOT] Task [${taskId}] ARMED in ${mode} mode.`);
  return taskId;
}

export function disarmSniper(taskId: string): boolean {
  const removed = activeTasks.delete(taskId);
  if (removed) {
    console.log(`🛑 [SHIFT BOT] Task [${taskId}] DISARMED.`);
  }
  return removed;
}

export function getActiveTasks() {
  return Array.from(activeTasks.values()).map(task => ({
    id: task.id,
    targetContract: task.targetContract,
    mintPriceEth: task.mintPriceEth,
    maxQuantity: task.maxQuantity,
    targetFunctionName: task.targetFunctionName,
    executionMode: task.executionMode
  }));
}