import { encodeFunctionData, type Address, type PublicClient } from "viem";

export const SEADROP_ADDRESS = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5" as Address;
export const OPENSEA_FEE_RECIPIENT = "0x0000a26b00c1F0DF003000390027140000fAa719" as Address;

export const seaDropAbi = [
  {
    name: "getPublicDrop",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "nftContract", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "mintPrice", type: "uint80" },
          { name: "startTime", type: "uint48" },
          { name: "endTime", type: "uint48" },
          { name: "maxTotalMintableByWallet", type: "uint16" },
          { name: "feeBps", type: "uint16" },
          { name: "restrictFeeRecipients", type: "bool" },
        ],
      },
    ],
  },
  {
    name: "getAllowedFeeRecipients",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "nftContract", type: "address" }],
    outputs: [{ type: "address[]" }],
  },
  {
    name: "mintPublic",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "minterIfNotPayer", type: "address" },
      { name: "quantity", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

type PublicDrop = {
  mintPrice: bigint;
  startTime: bigint;
  endTime: bigint;
  maxTotalMintableByWallet: bigint;
  restrictFeeRecipients: boolean;
};

function isRpcConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return ["fetch", "network", "timeout", "connection", "econn", "http request"].some((term) => message.includes(term));
}

// Read a SeaDrop collection's public-stage config and build its ready-to-sign mintPublic call.
export async function buildSeaDropPlan(publicClient: PublicClient, nftContract: Address, quantity: number) {
  try {
    const rawDrop = await publicClient.readContract({
      address: SEADROP_ADDRESS,
      abi: seaDropAbi,
      functionName: "getPublicDrop",
      args: [nftContract],
    });
    const drop = rawDrop as unknown as PublicDrop;
    if (drop.startTime === 0n && drop.endTime === 0n && drop.maxTotalMintableByWallet === 0n) return null;
    if (quantity > Number(drop.maxTotalMintableByWallet)) {
      throw new Error(`Quantity exceeds this drop's ${drop.maxTotalMintableByWallet} per-wallet limit.`);
    }
    const allowed = await publicClient.readContract({
      address: SEADROP_ADDRESS,
      abi: seaDropAbi,
      functionName: "getAllowedFeeRecipients",
      args: [nftContract],
    });
    const feeRecipient = allowed[0] ?? (drop.restrictFeeRecipients ? undefined : OPENSEA_FEE_RECIPIENT);
    if (!feeRecipient) throw new Error("This SeaDrop collection has no allowed fee recipient.");

    return {
      to: SEADROP_ADDRESS,
      data: encodeFunctionData({
        abi: seaDropAbi,
        functionName: "mintPublic",
        args: [nftContract, feeRecipient, "0x0000000000000000000000000000000000000000", BigInt(quantity)],
      }),
      value: drop.mintPrice * BigInt(quantity),
      startsAt: Number(drop.startTime) * 1_000,
      endsAt: Number(drop.endTime) * 1_000,
      mintPriceEth: (Number(drop.mintPrice) / 1e18).toString(),
    };
  } catch (error) {
    if (isRpcConnectionError(error)) {
      throw new Error(`SeaDrop RPC request failed: ${error instanceof Error ? error.message : "Unknown RPC error."}`);
    }

    if (
      error instanceof Error &&
      (error.message.includes("per-wallet limit") || error.message.includes("allowed fee recipient"))
    ) {
      throw error;
    }
    return null;
  }
}
