import { createWalletClient, encodeFunctionData, http, parseEther, parseGwei, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { publicClient, robinhoodChain } from '@/lib/viem';
import { buildSeaDropPlan } from '@/lib/seadrop';

const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const GAS_LIMIT = 250_000n;

interface SignBurnerSnipeParams {
  privateKey: Hex;
  targetContract: Address;
  quantity: number;
  fallbackPriceEth: string;
  functionName: string;
  maxFeeGwei: string;
  priorityTipGwei: string;
}

/**
 * Builds and signs the mint transaction entirely in the browser using a
 * burner wallet's private key. The key is used locally to sign and is never
 * transmitted anywhere — only the resulting signed transaction is returned,
 * which is safe to send to the server for scheduled broadcast.
 */
export async function signBurnerSnipe({
  privateKey,
  targetContract,
  quantity,
  fallbackPriceEth,
  functionName,
  maxFeeGwei,
  priorityTipGwei,
}: SignBurnerSnipeParams) {
  const account = privateKeyToAccount(privateKey);
  const plan = await buildSeaDropPlan(publicClient, targetContract, quantity);

  const to = plan?.to ?? targetContract;
  const data =
    plan?.data ??
    encodeFunctionData({
      abi: [{ name: functionName, type: 'function', stateMutability: 'payable', inputs: [{ name: 'quantity', type: 'uint256' }], outputs: [] }],
      functionName,
      args: [BigInt(quantity)],
    });
  const value = plan?.value ?? parseEther(fallbackPriceEth);

  if (plan?.endsAt && plan.endsAt <= Date.now()) {
    throw new Error('This SeaDrop public mint has already ended.');
  }

  const maxFeePerGas = parseGwei(maxFeeGwei || '25');
  const maxPriorityFeePerGas = parseGwei(priorityTipGwei || '5');
  if (maxPriorityFeePerGas > maxFeePerGas) throw new Error('Priority tip cannot exceed the max fee.');

  const [nonce, chainId, balance] = await Promise.all([
    publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' }),
    publicClient.getChainId(),
    publicClient.getBalance({ address: account.address }),
  ]);

  if (balance < value + GAS_LIMIT * maxFeePerGas) {
    throw new Error(`Burner ${account.address} cannot cover the mint value plus max gas reservation.`);
  }

  const walletClient = createWalletClient({ account, chain: robinhoodChain, transport: http(RPC_URL) });
  const signedTransaction = await walletClient.signTransaction({
    account,
    to,
    data,
    value,
    nonce,
    chainId,
    gas: GAS_LIMIT,
    maxFeePerGas,
    maxPriorityFeePerGas,
    type: 'eip1559',
  });

  return {
    signedTransaction,
    mintPriceEth: plan?.mintPriceEth ?? fallbackPriceEth,
  };
}