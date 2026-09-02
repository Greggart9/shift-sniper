import { createWalletClient, encodeFunctionData, formatEther, http, parseEther, parseGwei, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getPublicClient } from "@/lib/viem";
import { DEFAULT_CHAIN_ID, getChainConfig } from "@/lib/chains";
import { buildSeaDropPlan } from "@/lib/seadrop";

const GAS_LIMIT_BUFFER_NUMERATOR = 120n;
const GAS_LIMIT_BUFFER_DENOMINATOR = 100n;

// Each bump tier must be comfortably above Ethereum's ~10% replace-by-fee
// minimum, or nodes will reject the replacement outright.
const BUMP_TIERS = 3;
const BUMP_MULTIPLIER = 1.3;

function cap(value: bigint, ceiling: bigint) {
  return value < ceiling ? value : ceiling;
}

interface SignBurnerSnipeParams {
  privateKey: Hex;
  chainId?: number;
  targetContract: Address;
  quantity: number;
  fallbackPriceEth: string;
  functionName: string;
  mintCalldata?: Hex;
}

async function determineGasPolicy(client: ReturnType<typeof getPublicClient>, account: Address, to: Address, data: Hex, value: bigint, chainConfig: ReturnType<typeof getChainConfig>) {
  const [gasEstimate, block] = await Promise.all([
    client.estimateGas({ account, to, data, value }),
    client.getBlock({ blockTag: "latest" }),
  ]);
  const gasLimit = (gasEstimate * GAS_LIMIT_BUFFER_NUMERATOR + GAS_LIMIT_BUFFER_DENOMINATOR - 1n) / GAS_LIMIT_BUFFER_DENOMINATOR;
  const maxGasFee = parseGwei(chainConfig.maxGasFeeGwei);
  const maxPriorityFee = parseGwei(chainConfig.maxPriorityFeeGwei);

  if (block.baseFeePerGas !== undefined && block.baseFeePerGas !== null) {
    const fees = await client.estimateFeesPerGas({ chain: chainConfig.chain, type: "eip1559" });
    const priorityFee = fees.maxPriorityFeePerGas ?? maxPriorityFee;
    const maxFee = fees.maxFeePerGas ?? (block.baseFeePerGas * 2n + priorityFee);
    if (priorityFee > maxPriorityFee || maxFee > maxGasFee) {
      throw new Error(`Current network gas exceeds the ${chainConfig.maxGasFeeGwei} Gwei automatic safety ceiling.`);
    }
    return { gasLimit, type: "eip1559" as const, maxFeePerGas: maxFee, maxPriorityFeePerGas: priorityFee, estimatedGasCost: gasEstimate * maxFee };
  }

  const gasPrice = await client.getGasPrice();
  if (gasPrice > maxGasFee) {
    throw new Error(`Current network gas exceeds the ${chainConfig.maxGasFeeGwei} Gwei automatic safety ceiling.`);
  }
  return { gasLimit, type: "legacy" as const, gasPrice, estimatedGasCost: gasEstimate * gasPrice };
}

// Build and sign the mint transaction locally; only the signed transaction is sent to the server.
export async function signBurnerSnipe({
  privateKey,
  chainId,
  targetContract,
  quantity,
  fallbackPriceEth,
  functionName,
  mintCalldata,
}: SignBurnerSnipeParams) {
  const account = privateKeyToAccount(privateKey);
  const selectedChainId = chainId ?? DEFAULT_CHAIN_ID;
  const chainConfig = getChainConfig(selectedChainId);
  const client = getPublicClient(selectedChainId);
  const plan = mintCalldata ? undefined : await buildSeaDropPlan(client, targetContract, quantity);

  const to = plan?.to ?? targetContract;
  const data =
    mintCalldata ??
    plan?.data ??
    encodeFunctionData({
      abi: [
        {
          name: functionName,
          type: "function",
          stateMutability: "payable",
          inputs: [{ name: "quantity", type: "uint256" }],
          outputs: [],
        },
      ],
      functionName,
      args: [BigInt(quantity)],
    });
  const value = plan?.value ?? parseEther(fallbackPriceEth);

  if (plan?.endsAt && plan.endsAt <= Date.now()) {
    throw new Error("This SeaDrop public mint has already ended.");
  }

  const policy = await determineGasPolicy(client, account.address, to, data, value, chainConfig);
  const [nonce, balance] = await Promise.all([
    client.getTransactionCount({ address: account.address, blockTag: "pending" }),
    client.getBalance({ address: account.address }),
  ]);

  if (balance < value + policy.estimatedGasCost) {
    throw new Error(
      `Insufficient balance for burner ${account.address}: ` +
      `needs at least ${formatEther(value + policy.estimatedGasCost)} ETH ` +
      `(mint plus estimated gas), has ${formatEther(balance)} ETH.`,
    );
  }

  const walletClient = createWalletClient({ account, chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });
  const signedTransaction = await walletClient.signTransaction({
    account,
    to,
    data,
    value,
    nonce,
    chain: chainConfig.chain,
    gas: policy.gasLimit,
    ...(policy.type === "eip1559" ? { maxFeePerGas: policy.maxFeePerGas, maxPriorityFeePerGas: policy.maxPriorityFeePerGas, type: "eip1559" as const } : { gasPrice: policy.gasPrice, type: "legacy" as const }),
  });

  return {
    signedTransaction,
    mintPriceEth: plan?.mintPriceEth ?? fallbackPriceEth,
  };
}

// Build a same-nonce fee ladder so the server can bump gas without holding the wallet key.
export async function signBurnerSnipeFeeTiers({
  privateKey,
  chainId,
  targetContract,
  quantity,
  fallbackPriceEth,
  functionName,
  mintCalldata,
}: SignBurnerSnipeParams) {
  const account = privateKeyToAccount(privateKey);
  const selectedChainId = chainId ?? DEFAULT_CHAIN_ID;
  const chainConfig = getChainConfig(selectedChainId);
  const client = getPublicClient(selectedChainId);
  const plan = mintCalldata ? undefined : await buildSeaDropPlan(client, targetContract, quantity);

  const to = plan?.to ?? targetContract;
  const data =
    mintCalldata ??
    plan?.data ??
    encodeFunctionData({
      abi: [
        {
          name: functionName,
          type: "function",
          stateMutability: "payable",
          inputs: [{ name: "quantity", type: "uint256" }],
          outputs: [],
        },
      ],
      functionName,
      args: [BigInt(quantity)],
    });
  const value = plan?.value ?? parseEther(fallbackPriceEth);

  if (plan?.endsAt && plan.endsAt <= Date.now()) {
    throw new Error("This SeaDrop public mint has already ended.");
  }

  const policy = await determineGasPolicy(client, account.address, to, data, value, chainConfig);
  const [nonce, balance] = await Promise.all([
    client.getTransactionCount({ address: account.address, blockTag: "pending" }),
    client.getBalance({ address: account.address }),
  ]);

  const maxGasFee = parseGwei(chainConfig.maxGasFeeGwei);
  const maxPriorityFee = parseGwei(chainConfig.maxPriorityFeeGwei);
  const highestFee = policy.type === "eip1559"
    ? cap(BigInt(Math.ceil(Number(policy.maxFeePerGas) * BUMP_MULTIPLIER ** (BUMP_TIERS - 1))), maxGasFee)
    : cap(BigInt(Math.ceil(Number(policy.gasPrice) * BUMP_MULTIPLIER ** (BUMP_TIERS - 1))), maxGasFee);
  if (balance < value + policy.gasLimit * highestFee) {
    throw new Error(
      `Burner ${account.address} cannot cover the mint value plus the highest fee-bump tier's gas reservation.`,
    );
  }

  const walletClient = createWalletClient({ account, chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });

  const feeTiers: Hex[] = [];
  let previousFee = 0n;
  for (let i = 0; i < BUMP_TIERS; i++) {
    const factor = BUMP_MULTIPLIER ** i;
    const fee = cap(
      BigInt(Math.ceil(Number(policy.type === "eip1559" ? policy.maxFeePerGas : policy.gasPrice) * factor)),
      maxGasFee,
    );
    const priorityFee = policy.type === "eip1559"
      ? cap(BigInt(Math.ceil(Number(policy.maxPriorityFeePerGas) * factor)), maxPriorityFee)
      : undefined;
    if (fee <= previousFee || (priorityFee !== undefined && priorityFee > fee)) break;
    const signed = await walletClient.signTransaction({
      account,
      to,
      data,
      value,
      nonce,
      chain: chainConfig.chain,
      gas: policy.gasLimit,
      ...(policy.type === "eip1559" ? { maxFeePerGas: fee, maxPriorityFeePerGas: priorityFee, type: "eip1559" as const } : { gasPrice: fee, type: "legacy" as const }),
    });
    feeTiers.push(signed);
    previousFee = fee;
  }

  return {
    feeTiers,
    mintPriceEth: plan?.mintPriceEth ?? fallbackPriceEth,
    estimatedGasEth: formatEther(policy.estimatedGasCost),
    availableBalanceEth: formatEther(balance),
    estimatedTotalEth: formatEther(value + policy.estimatedGasCost),
    gasLimit: policy.gasLimit.toString(),
  };
}
