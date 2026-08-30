import {
  createWalletClient,
  encodeFunctionData,
  http,
  formatEther,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getPublicClient } from "@/lib/viem";
import { DEFAULT_CHAIN_ID, getChainConfig } from "@/lib/chains";
import type { BurnerAccount } from "@/components/BurnerWalletManager";

const TRANSFER_GAS = 21_000n;

export interface WithdrawResult {
  address: Address;
  status: "success" | "error" | "skipped";
  detail: string;
  txHash?: Hex;
}

export interface NftTransferResult {
  tokenId: string;
  status: "success" | "error" | "skipped";
  detail: string;
  txHash?: Hex;
}

const erc721BalanceAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "tokenOfOwnerByIndex",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

const erc721TransferAbi = [
  {
    name: "safeTransferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const erc1155BalanceAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

const erc1155TransferAbi = [
  {
    name: "safeTransferFrom",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "id", type: "uint256" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/**
 * Discover all ERC721 contracts that a wallet owns NFTs from by scanning Transfer events
 */
async function discoverNftContracts(walletAddress: Address, chainId: number): Promise<Set<Address>> {
  const client = getPublicClient(getChainConfig(chainId).id);
  const contracts = new Set<Address>();

  try {
    // ERC721 Transfer event signature: Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a9df523b3ef" as const;

    // Scan for Transfer events where this wallet is the recipient (to)
    const logs = await client.getLogs({
      event: {
        type: "event",
        name: "Transfer",
        inputs: [
          { type: "address", indexed: true, name: "from" },
          { type: "address", indexed: true, name: "to" },
          { type: "uint256", indexed: true, name: "tokenId" },
        ],
      },
      args: {
        to: walletAddress,
      },
      fromBlock: "earliest",
      toBlock: "latest",
    });

    // Extract unique contract addresses
    for (const log of logs) {
      contracts.add(log.address);
    }
  } catch (error) {
    console.error("Failed to discover NFT contracts:", error);
    // If event scanning fails, return empty set (user must specify contracts)
  }

  return contracts;
}

/**
 * Send all ERC721/ERC721-C NFTs from wallet to recipient (auto-discovers contracts)
 */
export async function sendAllNftsFromBurner(
  wallet: BurnerAccount,
  recipientText: string,
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<NftTransferResult[]> {
  if (!isAddress(recipientText)) {
    throw new Error("Enter a valid recipient wallet address.");
  }

  const recipient = recipientText as Address;
  const account = privateKeyToAccount(wallet.privateKey);
  const chainConfig = getChainConfig(chainId);
  const client = getPublicClient(chainConfig.id);
  const walletClient = createWalletClient({ account, chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });

  const results: NftTransferResult[] = [];

  // Discover all NFT contracts for this wallet
  const contracts = await discoverNftContracts(account.address, chainId);

  if (contracts.size === 0) {
    throw new Error("No NFT contracts found for this wallet. Make sure the wallet has received NFTs.");
  }

  // Process each contract
  for (const contract of contracts) {
    try {
      // Get token count for this contract
      const ownedCount = await client.readContract({
        address: contract,
        abi: erc721BalanceAbi,
        functionName: "balanceOf",
        args: [account.address],
      });

      if (ownedCount === 0n) {
        continue;
      }

      // Enumerate all token IDs
      const tokenIds: string[] = [];
      for (let index = 0n; index < ownedCount; index++) {
        try {
          const tokenId = await client.readContract({
            address: contract,
            abi: erc721BalanceAbi,
            functionName: "tokenOfOwnerByIndex",
            args: [account.address, index],
          });
          tokenIds.push(tokenId.toString());
        } catch {
          // Token may not exist or enumeration may not be supported
          continue;
        }
      }

      // Transfer each token
      for (const tokenIdText of tokenIds) {
        try {
          const tokenId = BigInt(tokenIdText.trim());

          // Verify ownership
          try {
            const owner = await client.readContract({
              address: contract,
              abi: erc721BalanceAbi,
              functionName: "ownerOf",
              args: [tokenId],
            });
            if (owner.toLowerCase() !== account.address.toLowerCase()) {
              results.push({ tokenId: tokenId.toString(), status: "skipped", detail: "Burner does not own this token." });
              continue;
            }
          } catch {
            // ownerOf may fail for some contracts, proceed with transfer attempt
          }

          const data = encodeFunctionData({
            abi: erc721TransferAbi,
            functionName: "safeTransferFrom",
            args: [account.address, recipient, tokenId],
          });

          const gas = await client.estimateGas({ account, to: contract, data });
          const fees = await client.estimateFeesPerGas();
          const txHash = await walletClient.sendTransaction({
            account,
            to: contract,
            data,
            gas,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          });

          results.push({ tokenId: tokenId.toString(), status: "success", detail: "NFT transfer submitted.", txHash });
        } catch (error) {
          results.push({
            tokenId: tokenIdText,
            status: "error",
            detail: error instanceof Error ? error.message : "NFT transfer failed.",
          });
        }
      }
    } catch (error) {
      console.error(`Error processing contract ${contract}:`, error);
      // Continue to next contract
    }
  }

  return results;
}

export async function sendNftsFromBurner(
  wallet: BurnerAccount,
  recipientText: string,
  contractText: string,
  standard: "ERC721" | "ERC1155",
  chainId: number = DEFAULT_CHAIN_ID,
  amount: string,
): Promise<NftTransferResult[]> {
  if (!isAddress(recipientText) || !isAddress(contractText)) {
    throw new Error("Enter valid recipient and NFT contract addresses.");
  }

  const recipient = recipientText as Address;
  const contract = contractText as Address;
  const account = privateKeyToAccount(wallet.privateKey);
  const parsedAmount = BigInt(amount);
  if (parsedAmount <= 0n) throw new Error("NFT amount must be greater than zero.");
  if (standard === "ERC1155") {
    throw new Error("Automatic all-token discovery is supported for ERC-721 Enumerable collections only. ERC-1155 needs token IDs.");
  }

  const results: NftTransferResult[] = [];
  const chainConfig = getChainConfig(chainId);
  const client = getPublicClient(chainConfig.id);
  const walletClient = createWalletClient({ account, chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });
  const ownedCount = await client.readContract({
    address: contract,
    abi: erc721BalanceAbi,
    functionName: "balanceOf",
    args: [account.address],
  });
  const tokenIds: string[] = [];
  for (let index = 0n; index < ownedCount; index++) {
    const tokenId = await client.readContract({
      address: contract,
      abi: erc721BalanceAbi,
      functionName: "tokenOfOwnerByIndex",
      args: [account.address, index],
    });
    tokenIds.push(tokenId.toString());
  }

  for (const tokenIdText of tokenIds) {
    try {
      const tokenId = BigInt(tokenIdText.trim());
      if (tokenId < 0n) throw new Error("Token ID cannot be negative.");

      if (standard === "ERC721") {
        const owner = await client.readContract({
          address: contract,
          abi: erc721BalanceAbi,
          functionName: "ownerOf",
          args: [tokenId],
        });
        if (owner.toLowerCase() !== account.address.toLowerCase()) {
          results.push({ tokenId: tokenId.toString(), status: "skipped", detail: "Burner does not own this token." });
          continue;
        }
      } else {
        const balance = await client.readContract({
          address: contract,
          abi: erc1155BalanceAbi,
          functionName: "balanceOf",
          args: [account.address, tokenId],
        });
        if (balance < parsedAmount) {
          results.push({
            tokenId: tokenId.toString(),
            status: "skipped",
            detail: `Burner owns ${balance.toString()}, requested ${parsedAmount.toString()}.`,
          });
          continue;
        }
      }

      const data =
        standard === "ERC721"
          ? encodeFunctionData({
              abi: erc721TransferAbi,
              functionName: "safeTransferFrom",
              args: [account.address, recipient, tokenId],
            })
          : encodeFunctionData({
              abi: erc1155TransferAbi,
              functionName: "safeTransferFrom",
              args: [account.address, recipient, tokenId, parsedAmount, "0x"],
            });
      const gas = await client.estimateGas({ account, to: contract, data });
      const fees = await client.estimateFeesPerGas();
      const txHash = await walletClient.sendTransaction({
        account,
        to: contract,
        data,
        gas,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });

      results.push({ tokenId: tokenId.toString(), status: "success", detail: "NFT transfer submitted.", txHash });
    } catch (error) {
      results.push({
        tokenId: tokenIdText,
        status: "error",
        detail: error instanceof Error ? error.message : "NFT transfer failed.",
      });
    }
  }

  return results;
}

export async function sendAllBurnersToRecipient(
  wallets: BurnerAccount[],
  recipientText: string,
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<WithdrawResult[]> {
  if (!isAddress(recipientText)) {
    throw new Error("Enter a valid recipient wallet address.");
  }

  const recipient = recipientText as Address;
  const chainConfig = getChainConfig(chainId);
  const client = getPublicClient(chainConfig.id);
  const results: WithdrawResult[] = [];

  for (const wallet of wallets) {
    try {
      const account = privateKeyToAccount(wallet.privateKey);
      if (account.address.toLowerCase() === recipient.toLowerCase()) {
        results.push({
          address: account.address,
          status: "skipped",
          detail: "Recipient is the same as the burner wallet.",
        });
        continue;
      }

      const [balance, feesPerGas] = await Promise.all([
        client.getBalance({ address: account.address }),
        client.estimateFeesPerGas(),
      ]);
      const maxFeePerGas = feesPerGas.maxFeePerGas ?? (await client.getGasPrice());
      const gasCost = TRANSFER_GAS * maxFeePerGas;

      if (balance <= gasCost) {
        results.push({
          address: account.address,
          status: "skipped",
          detail: `Balance (${formatEther(balance)} ETH) doesn't cover gas.`,
        });
        continue;
      }

      const walletClient = createWalletClient({ account, chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });
      const txHash = await walletClient.sendTransaction({
        account,
        to: recipient,
        value: balance - gasCost,
        maxFeePerGas,
        maxPriorityFeePerGas: feesPerGas.maxPriorityFeePerGas,
        gas: TRANSFER_GAS,
      });

      results.push({
        address: account.address,
        status: "success",
        detail: `Sent ${formatEther(balance - gasCost)} ETH.`,
        txHash,
      });
    } catch (error) {
      results.push({
        address: wallet.address,
        status: "error",
        detail: error instanceof Error ? error.message : "Unknown error.",
      });
    }
  }

  return results;
}

// Sweep each burner wallet locally to the recipient, keeping enough balance for gas.
export async function withdrawAllBurners(
  wallets: BurnerAccount[],
  recipient: Address,
  chainId: number = DEFAULT_CHAIN_ID,
): Promise<WithdrawResult[]> {
  return sendAllBurnersToRecipient(wallets, recipient, chainId);
}

// Download the wallet manifest as JSON; it contains sensitive private keys.
export function downloadWalletManifest(wallets: BurnerAccount[]) {
  const manifest = {
    exportedAt: new Date().toISOString(),
    wallets: wallets.map((w) => ({ id: w.id, label: w.label, address: w.address, privateKey: w.privateKey })),
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `shift-sniper-wallets-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
