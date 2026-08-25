import { NextResponse } from 'next/server';
import { createPublicClient, http, isAddress, formatEther } from 'viem';
import { defineChain } from 'viem';

const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  network: 'robinhood-mainnet',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
    public: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
});

const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http('https://rpc.mainnet.chain.robinhood.com'),
});

const seaDropAddress = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5' as `0x${string}`;
const seaDropAbi = [
  {
    name: 'getPublicDrop', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'nftContract', type: 'address' }],
    outputs: [{ type: 'tuple', components: [
      { name: 'mintPrice', type: 'uint80' }, { name: 'startTime', type: 'uint48' },
      { name: 'endTime', type: 'uint48' }, { name: 'maxTotalMintableByWallet', type: 'uint16' },
      { name: 'feeBps', type: 'uint16' }, { name: 'restrictFeeRecipients', type: 'bool' },
    ] }],
  },
] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contractAddress = searchParams.get('address');

  if (!contractAddress || !isAddress(contractAddress)) {
    return NextResponse.json({ success: false, error: 'Invalid contract address.' }, { status: 400 });
  }

  let collectionName = 'Unknown Collection';
  let detectedPrice = '0.00';
  let detectedFunction = 'mint';

  try {
    // SeaDrop keeps a collection's public-stage configuration on the shared
    // SeaDrop contract, not on the NFT contract itself.
    try {
      const drop = await publicClient.readContract({
        address: seaDropAddress,
        abi: seaDropAbi,
        functionName: 'getPublicDrop',
        args: [contractAddress as `0x${string}`],
      }) as unknown as { mintPrice: bigint; startTime: bigint; endTime: bigint; maxTotalMintableByWallet: bigint };

      if (!(drop.startTime === 0n && drop.endTime === 0n && drop.maxTotalMintableByWallet === 0n)) {
        return NextResponse.json({
          success: true,
          name: collectionName,
          mintPrice: formatEther(drop.mintPrice),
          functionName: 'mintPublic',
          startTime: Number(drop.startTime),
          maxTotalMintableByWallet: Number(drop.maxTotalMintableByWallet),
          protocol: 'SeaDrop',
        });
      }
    } catch {
      // Not a SeaDrop public mint, so continue with generic contract inspection.
    }

    // 1. Fetch Collection Name
    try {
      const nameResult: any = await publicClient.readContract({
        address: contractAddress as `0x${string}`,
        abi: [{ name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }],
        functionName: 'name',
      });
      if (nameResult) collectionName = nameResult;
    } catch (e) {
      // Fallback if name() doesn't exist
    }

    // 2. Comprehensive array of common price getter function signatures
    const candidateFunctions = [
      'price',
      'mintPrice',
      'MINT_PRICE',
      'cost',
      'publicPrice',
      'getCurrentPrice',
      'getPrice'
    ];

    for (const fnName of candidateFunctions) {
      try {
        const result: any = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: [{ name: fnName, type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
          functionName: fnName,
        });

        if (result !== undefined && result !== null) {
          const formatted = formatEther(result);
          // If it successfully parses a valid number greater than 0 (or a valid 0 price free mint)
          if (Number(formatted) >= 0) {
            detectedPrice = formatted;
            break;
          }
        }
      } catch (e) {
        // Continue checking other function names
      }
    }

    // 3. Check for SeaDrop publicDrop struct if standard getters failed
    if (detectedPrice === '0.00') {
      try {
        const seaDropResult: any = await publicClient.readContract({
          address: contractAddress as `0x${string}`,
          abi: [{ 
            name: 'publicDrop', 
            type: 'function', 
            stateMutability: 'view', 
            inputs: [], 
            outputs: [{ 
              components: [
                { name: 'mintPrice', type: 'uint80' },
                { name: 'startTime', type: 'uint48' },
                { name: 'endTime', type: 'uint48' },
                { name: 'maxTotalMintableByWallet', type: 'uint16' },
                { name: 'feeBps', type: 'uint16' },
                { name: 'restrictFeeRecipients', type: 'bool' }
              ],
              type: 'tuple' 
            }] 
          }],
          functionName: 'publicDrop',
        });

        if (seaDropResult && seaDropResult.mintPrice !== undefined) {
          detectedPrice = formatEther(seaDropResult.mintPrice);
          detectedFunction = 'mintPublic';
        }
      } catch (e) {
        // Not SeaDrop
      }
    }

    return NextResponse.json({
      success: true,
      name: collectionName,
      mintPrice: detectedPrice,
      functionName: detectedFunction,
    });

  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: 'Could not inspect contract on-chain.' 
    }, { status: 500 });
  }
}
