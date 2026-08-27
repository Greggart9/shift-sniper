import { createPublicClient, http, type PublicClient } from "viem";
import { DEFAULT_CHAIN_ID, getChainConfig, ROBINHOOD_RPC_URL, robinhoodChain } from "@/lib/chains";

export { robinhoodChain } from "@/lib/chains";

export const publicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(ROBINHOOD_RPC_URL),
});

const publicClients = new Map<number, PublicClient>();
publicClients.set(DEFAULT_CHAIN_ID, publicClient);

export function getPublicClient(chainId: number = DEFAULT_CHAIN_ID) {
  const existingClient = publicClients.get(chainId);
  if (existingClient) return existingClient;

  const chainConfig = getChainConfig(chainId);
  const client = createPublicClient({ chain: chainConfig.chain, transport: http(chainConfig.rpcUrl) });
  publicClients.set(chainId, client);
  return client;
}
