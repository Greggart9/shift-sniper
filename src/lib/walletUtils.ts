import { createWalletClient, http, formatEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "@/lib/viem";
import { ROBINHOOD_RPC_URL, robinhoodChain } from "@/lib/chains";
import type { BurnerAccount } from "@/components/BurnerWalletManager";

const RPC_URL = ROBINHOOD_RPC_URL;
const TRANSFER_GAS = 21_000n;

export interface WithdrawResult {
  address: Address;
  status: "success" | "error" | "skipped";
  detail: string;
  txHash?: Hex;
}

// Sweep each burner wallet locally to the recipient, keeping enough balance for gas.
export async function withdrawAllBurners(wallets: BurnerAccount[], recipient: Address): Promise<WithdrawResult[]> {
  const results: WithdrawResult[] = [];

  for (const wallet of wallets) {
    try {
      const account = privateKeyToAccount(wallet.privateKey);
      const [balance, feesPerGas] = await Promise.all([
        publicClient.getBalance({ address: account.address }),
        publicClient.estimateFeesPerGas(),
      ]);

      const gasCost = TRANSFER_GAS * (feesPerGas.maxFeePerGas ?? 0n);
      if (balance <= gasCost) {
        results.push({
          address: account.address,
          status: "skipped",
          detail: `Balance (${formatEther(balance)} ETH) doesn't cover gas.`,
        });
        continue;
      }

      const amountToSend = balance - gasCost;
      const walletClient = createWalletClient({ account, chain: robinhoodChain, transport: http(RPC_URL) });

      const txHash = await walletClient.sendTransaction({
        account,
        to: recipient,
        value: amountToSend,
        maxFeePerGas: feesPerGas.maxFeePerGas,
        maxPriorityFeePerGas: feesPerGas.maxPriorityFeePerGas,
        gas: TRANSFER_GAS,
      });

      results.push({
        address: account.address,
        status: "success",
        detail: `Sent ${formatEther(amountToSend)} ETH.`,
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
