import { NextResponse } from "next/server";
import { protectApi } from "@/lib/arcjet";
import { isAddress, formatEther } from "viem";
import { DEFAULT_CHAIN_ID, getChainConfig } from "@/lib/chains";
import { getPublicClient } from "@/lib/viem";

const seaDropAddress = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5" as `0x${string}`;

// ABIs

const nameAbi = [
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

const symbolAbi = [
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

const totalSupplyAbi = [
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

const contractUriAbi = [
  {
    name: "contractURI",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

const seaDropAbi = [
  {
    name: "getPublicDrop",
    type: "function",
    stateMutability: "view",
    inputs: [
      {
        name: "nftContract",
        type: "address",
      },
    ],
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
] as const;

// Helper functions

async function readCollectionName(client: ReturnType<typeof getPublicClient>, address: `0x${string}`) {
  try {
    const result = await client.readContract({
      address,
      abi: nameAbi,
      functionName: "name",
    });

    return result || "Unknown Collection";
  } catch {
    return "Unknown Collection";
  }
}

async function readCollectionSymbol(client: ReturnType<typeof getPublicClient>, address: `0x${string}`) {
  try {
    const result = await client.readContract({
      address,
      abi: symbolAbi,
      functionName: "symbol",
    });

    return result || "";
  } catch {
    return "";
  }
}

async function readTotalSupply(client: ReturnType<typeof getPublicClient>, address: `0x${string}`) {
  try {
    const result = await client.readContract({
      address,
      abi: totalSupplyAbi,
      functionName: "totalSupply",
    });

    return result.toString();
  } catch {
    return undefined;
  }
}

// Metadata and collection image

function ipfsToHttp(uri: string) {
  if (!uri) return null;

  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return uri;
  }

  return null;
}

async function readCollectionMetadata(client: ReturnType<typeof getPublicClient>, address: `0x${string}`) {
  try {
    const uri = await client.readContract({
      address,
      abi: contractUriAbi,
      functionName: "contractURI",
    });

    if (!uri) {
      return {};
    }

    const metadataUrl = ipfsToHttp(uri);

    if (!metadataUrl) {
      return {};
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetch(metadataUrl, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        return {};
      }

      const metadata = (await response.json()) as Record<string, unknown>;

      let image: string | undefined;

      if (typeof metadata.image === "string") {
        image = ipfsToHttp(metadata.image) ?? undefined;
      }

      return {
        metadataUrl,
        image,
        description: typeof metadata.description === "string" ? metadata.description : undefined,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return {};
  }
}

// Price detection

async function detectMintPrice(client: ReturnType<typeof getPublicClient>, address: `0x${string}`) {
  const candidateFunctions = ["price", "mintPrice", "MINT_PRICE", "cost", "publicPrice", "getCurrentPrice", "getPrice"];

  for (const fnName of candidateFunctions) {
    try {
      const result = await client.readContract({
        address,
        abi: [
          {
            name: fnName,
            type: "function",
            stateMutability: "view",
            inputs: [],
            outputs: [
              {
                type: "uint256",
              },
            ],
          },
        ],
        functionName: fnName,
      });

      if (result !== undefined && result !== null) {
        const formatted = formatEther(result);

        if (Number.isFinite(Number(formatted)) && Number(formatted) >= 0) {
          return {
            price: formatted,
            functionName: fnName,
          };
        }
      }
    } catch {
      // Try the next getter.
    }
  }

  return {
    price: "0.00",
    functionName: "mint",
  };
}

// GET handler

export async function GET(request: Request) {
  const blocked = await protectApi(request, "expensive-read");
  if (blocked) return blocked;
  const { searchParams } = new URL(request.url);
  const requestedChainId = Number(searchParams.get("chainId") ?? DEFAULT_CHAIN_ID);

  const contractAddress = searchParams.get("address");

  if (!contractAddress || !isAddress(contractAddress)) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid contract address.",
      },
      { status: 400 },
    );
  }

  const address = contractAddress as `0x${string}`;

  try {
    const chainConfig = getChainConfig(requestedChainId);
    const client = getPublicClient(chainConfig.id);
    // Read basic collection information.

    const [collectionName, collectionSymbol, totalSupply, collectionMetadata] = await Promise.all([
      readCollectionName(client, address),
      readCollectionSymbol(client, address),
      readTotalSupply(client, address),
      readCollectionMetadata(client, address),
    ]);

    // Check SeaDrop public mint.

    let seaDropData:
      | {
          mintPrice: bigint;
          startTime: bigint;
          endTime: bigint;
          maxTotalMintableByWallet: bigint;
        }
      | undefined;

    try {
      const drop = (await client.readContract({
        address: seaDropAddress,
        abi: seaDropAbi,
        functionName: "getPublicDrop",
        args: [address],
      })) as unknown as {
        mintPrice: bigint;
        startTime: bigint;
        endTime: bigint;
        maxTotalMintableByWallet: bigint;
      };

      if (!(drop.startTime === 0n && drop.endTime === 0n && drop.maxTotalMintableByWallet === 0n)) {
        seaDropData = drop;
      }
    } catch {
      // Not a SeaDrop collection.
    }

    // Detect generic mint price and function.

    const genericPrice = await detectMintPrice(client, address);

    // SeaDrop takes priority when available.

    if (seaDropData) {
      return NextResponse.json({
        success: true,

        name: collectionName,
        symbol: collectionSymbol,

        image: collectionMetadata.image,

        metadataUrl: collectionMetadata.metadataUrl,

        description: collectionMetadata.description,

        totalSupply,

        mintPrice: formatEther(seaDropData.mintPrice),

        functionName: "mintPublic",

        startTime: Number(seaDropData.startTime),

        endTime: Number(seaDropData.endTime),

        maxTotalMintableByWallet: Number(seaDropData.maxTotalMintableByWallet),

        protocol: "SeaDrop",
      });
    }

    // Return the generic collection response.

    return NextResponse.json({
      success: true,

      name: collectionName,
      symbol: collectionSymbol,

      image: collectionMetadata.image,

      metadataUrl: collectionMetadata.metadataUrl,

      description: collectionMetadata.description,

      totalSupply,

      mintPrice: genericPrice.price,

      functionName: genericPrice.functionName,
    });
  } catch (error) {
    console.error("[INSPECT] Contract inspection failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Could not inspect contract on-chain.",
      },
      { status: 500 },
    );
  }
}
