import { createWalletClient, encodeFunctionData, http, parseEther, parseGwei, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getPublicClient } from "@/lib/viem";
import { DEFAULT_CHAIN_ID, getChainConfig } from "@/lib/chains";
import { buildSeaDropPlan } from "@/lib/seadrop";

const GAS_LIMIT = 250_000n;

// Each bump tier must be comfortably above Ethereum's ~10% replace-by-fee
// minimum, or nodes will reject the replacement outright.
const BUMP_TIERS = 3;
const BUMP_MULTIPLIER = 1.3;

interface SignBurnerSnipeParams {
  privateKey: Hex;
  chainId?: number;
  targetContract: Address;
  quantity: number;
  fallbackPriceEth: string;
  functionName: string;
  maxFeeGwei: string;
  priorityTipGwei: string;
}

// Build and sign the mint transaction locally; only the signed transaction is sent to the server.
export async function signBurnerSnipe({
  privateKey,
  chainId,
  targetContract,
  quantity,
  fallbackPriceEth,
  functionName,
  maxFeeGwei,
  priorityTipGwei,
}: SignBurnerSnipeParams) {
  const account = privateKeyToAccount(privateKey);
  const selectedChainId = chainId ?? DEFAULT_CHAIN_ID;
  const chainConfig = getChainConfig(selectedChainId);
  const client = getPublicClient(selectedChainId);
  const plan = await buildSeaDropPlan(client, targetContract, quantity);

  const to = plan?.to ?? targetContract;
  const data =
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

  const maxFeePerGas = parseGwei(maxFeeGwei || "25");
  const maxPriorityFeePerGas = parseGwei(priorityTipGwei || "5");
  if (maxPriorityFeePerGas > maxFeePerGas) throw new Error("Priority tip cannot exceed the max fee.");

  const [nonce, networkChainId, balance] = await Promise.all([
    client.getTransactionCount({ address: account.address, blockTag: "pending" }),
    client.getChainId(),
    client.getBalance({ address: account.address }),
  ]);

  if (balance < value + GAS_LIMIT * maxFeePerGas) {
    throw new Error(`Burner ${account.address} cannot cover the mint value plus max gas reservation.`);
  }

  const walletClient = createWalletClient({ account, chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });
  const signedTransaction = await walletClient.signTransaction({
    account,
    to,
    data,
    value,
    nonce,
    chainId: networkChainId,
    gas: GAS_LIMIT,
    maxFeePerGas,
    maxPriorityFeePerGas,
    type: "eip1559",
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
  maxFeeGwei,
  priorityTipGwei,
}: SignBurnerSnipeParams) {
  const account = privateKeyToAccount(privateKey);
  const selectedChainId = chainId ?? DEFAULT_CHAIN_ID;
  const chainConfig = getChainConfig(selectedChainId);
  const client = getPublicClient(selectedChainId);
  const plan = await buildSeaDropPlan(client, targetContract, quantity);

  const to = plan?.to ?? targetContract;
  const data =
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

  const baseMaxFee = parseGwei(maxFeeGwei || "25");
  const basePriorityFee = parseGwei(priorityTipGwei || "5");
  if (basePriorityFee > baseMaxFee) throw new Error("Priority tip cannot exceed the max fee.");

  const [nonce, networkChainId, balance] = await Promise.all([
    client.getTransactionCount({ address: account.address, blockTag: "pending" }),
    client.getChainId(),
    client.getBalance({ address: account.address }),
  ]);

  const highestMaxFee = BigInt(Math.ceil(Number(baseMaxFee) * BUMP_MULTIPLIER ** (BUMP_TIERS - 1)));
  if (balance < value + GAS_LIMIT * highestMaxFee) {
    throw new Error(
      `Burner ${account.address} cannot cover the mint value plus the highest fee-bump tier's gas reservation.`,
    );
  }

  const walletClient = createWalletClient({ account, chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });

  const feeTiers: Hex[] = [];
  for (let i = 0; i < BUMP_TIERS; i++) {
    const factor = BUMP_MULTIPLIER ** i;
    const tierMaxFee = BigInt(Math.ceil(Number(baseMaxFee) * factor));
    const tierPriorityFee = BigInt(Math.ceil(Number(basePriorityFee) * factor));
    const signed = await walletClient.signTransaction({
      account,
      to,
      data,
      value,
      nonce,
      chainId: networkChainId,
      gas: GAS_LIMIT,
      maxFeePerGas: tierMaxFee,
      maxPriorityFeePerGas: tierPriorityFee,
      type: "eip1559",
    });
    feeTiers.push(signed);
  }

  return {
    feeTiers,
    mintPriceEth: plan?.mintPriceEth ?? fallbackPriceEth,
  };
}
