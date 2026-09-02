import { NextResponse } from "next/server";
import { protectApi } from "@/lib/arcjet";
import { createPublicClient, http } from "viem";
import { ROBINHOOD_FALLBACK_RPC_URL, ROBINHOOD_RPC_URL, robinhoodChain } from "@/lib/chains";

const RPC_URL = ROBINHOOD_RPC_URL;
const FALLBACK_RPC_URL = ROBINHOOD_FALLBACK_RPC_URL;

interface CheckResult {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
}

async function checkReadRpc(url: string, label: string): Promise<CheckResult> {
  try {
    const client = createPublicClient({ chain: robinhoodChain, transport: http(url) });
    const start = Date.now();
    const [chainId, block] = await Promise.all([client.getChainId(), client.getBlock()]);
    const latencyMs = Date.now() - start;

    if (chainId !== robinhoodChain.id) {
      return {
        name: label,
        status: "FAIL",
        detail: `Chain ID mismatch: RPC returned ${chainId}, expected ${robinhoodChain.id}.`,
      };
    }

    const blockAgeMs = Date.now() - Number(block.timestamp) * 1000;
    if (blockAgeMs > 60_000) {
      return {
        name: label,
        status: "WARN",
        detail: `Reachable (${latencyMs}ms) but the latest block is ${Math.round(blockAgeMs / 1000)}s old — the chain may be stalled, or your server clock is drifting.`,
      };
    }

    return { name: label, status: "PASS", detail: `Reachable, ${latencyMs}ms latency, chain ID ${chainId} confirmed.` };
  } catch (error) {
    return { name: label, status: "FAIL", detail: error instanceof Error ? error.message : "Unreachable." };
  }
}

// Sequencer relays may reject reads, so probe eth_sendRawTransaction with a malformed transaction.
async function checkBroadcastRpc(url: string, label: string): Promise<CheckResult> {
  try {
    const start = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_sendRawTransaction", params: ["0xdeadbeef"], id: 1 }),
    });

    if (!response.ok) {
      return { name: label, status: "FAIL", detail: `RPC returned HTTP ${response.status}.` };
    }

    const latencyMs = Date.now() - start;
    const payload = (await response.json()) as { error?: { message?: string } };
    const message = payload.error?.message?.toLowerCase() ?? "";

    if (
      message.includes("does not exist") ||
      message.includes("not available") ||
      message.includes("method not found")
    ) {
      return {
        name: label,
        status: "FAIL",
        detail: `eth_sendRawTransaction is not supported here: ${payload.error?.message}`,
      };
    }

    return {
      name: label,
      status: "PASS",
      detail: `Broadcast endpoint live (${latencyMs}ms) — rejected the test payload as expected: ${payload.error?.message ?? "no error returned"}.`,
    };
  } catch (error) {
    return { name: label, status: "FAIL", detail: error instanceof Error ? error.message : "Unreachable." };
  }
}

export async function GET(request: Request) {
  const blocked = await protectApi(request, "api");
  if (blocked) return blocked;
  const checks: CheckResult[] = [];

  checks.push(await checkReadRpc(RPC_URL, "Primary RPC (reads)"));
  checks.push(await checkBroadcastRpc(RPC_URL, "Primary RPC (broadcast)"));
  checks.push(await checkBroadcastRpc(FALLBACK_RPC_URL, "Fallback RPC (broadcast)"));

  const authConfigured = Boolean(process.env.SNIPER_AUTH_USER && process.env.SNIPER_AUTH_PASS);
  checks.push({
    name: "Dashboard auth",
    status: authConfigured ? "PASS" : "FAIL",
    detail: authConfigured
      ? "SNIPER_AUTH_USER / SNIPER_AUTH_PASS are set."
      : "SNIPER_AUTH_USER / SNIPER_AUTH_PASS are missing — the dashboard is unprotected, or blocking all access.",
  });

  const walletConnectConfigured = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);
  checks.push({
    name: "WalletConnect project ID",
    status: walletConnectConfigured ? "PASS" : "WARN",
    detail: walletConnectConfigured
      ? "Configured."
      : "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is missing — connected-wallet signing will not work.",
  });

  return NextResponse.json({ checks, timestamp: new Date().toISOString() });
}
