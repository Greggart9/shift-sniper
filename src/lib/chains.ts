import { defineChain, type Chain } from "viem";

export const ROBINHOOD_RPC_URL = process.env.ROBINHOOD_CHAIN_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
export const ROBINHOOD_FALLBACK_RPC_URL = "https://sequencer.mainnet.chain.robinhood.com";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  network: "robinhood-mainnet",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: [ROBINHOOD_RPC_URL] },
    public: { http: [ROBINHOOD_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

export const ethereumChain = defineChain({
  id: 1,
  name: "Ethereum",
  network: "ethereum-mainnet",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://ethereum-rpc.publicnode.com"] },
    public: { http: ["https://ethereum-rpc.publicnode.com"] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://etherscan.io" },
  },
});

export const baseChain = defineChain({
  id: 8453,
  name: "Base",
  network: "base-mainnet",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://mainnet.base.org"] },
    public: { http: ["https://mainnet.base.org"] },
  },
  blockExplorers: {
    default: { name: "Basescan", url: "https://basescan.org" },
  },
});

export const arbitrumOneChain = defineChain({
  id: 42161,
  name: "Arbitrum One",
  network: "arbitrum-one",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://arb1.arbitrum.io/rpc"] },
    public: { http: ["https://arb1.arbitrum.io/rpc"] },
  },
  blockExplorers: {
    default: { name: "Arbiscan", url: "https://arbiscan.io" },
  },
});

export const inkChain = defineChain({
  id: 57073,
  name: "Ink",
  network: "ink-mainnet",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: { http: ["https://rpc-gel.inkonchain.com"] },
    public: { http: ["https://rpc-gel.inkonchain.com"] },
  },
  blockExplorers: {
    default: { name: "Ink Explorer", url: "https://explorer.inkonchain.com" },
  },
});

export interface ChainConfig {
  id: number;
  key: string;
  label: string;
  chain: Chain;
  rpcUrl: string;
  // Extra RPC endpoints used only for broadcast fan-out.
  fallbackRpcUrls: string[];
  explorerUrl: string;
  // Seed per-chain gas defaults because gas norms vary significantly by network.
  maxGasFeeGwei: string;
  maxPriorityFeeGwei: string;
}

export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    id: 4663,
    key: "robinhood",
    label: "Robinhood Chain",
    chain: robinhoodChain,
    rpcUrl: ROBINHOOD_RPC_URL,
    fallbackRpcUrls: [ROBINHOOD_FALLBACK_RPC_URL],
    explorerUrl: "https://robinhoodchain.blockscout.com",
    maxGasFeeGwei: "25",
    maxPriorityFeeGwei: "5",
  },
  {
    id: 1,
    key: "ethereum",
    label: "Ethereum",
    chain: ethereumChain,
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    fallbackRpcUrls: ["https://eth.llamarpc.com"],
    explorerUrl: "https://etherscan.io",
    maxGasFeeGwei: "100",
    maxPriorityFeeGwei: "5",
  },
  {
    id: 8453,
    key: "base",
    label: "Base",
    chain: baseChain,
    rpcUrl: "https://mainnet.base.org",
    fallbackRpcUrls: ["https://base-rpc.publicnode.com"],
    explorerUrl: "https://basescan.org",
    maxGasFeeGwei: "1",
    maxPriorityFeeGwei: "0.1",
  },
  {
    id: 42161,
    key: "arbitrum",
    label: "Arbitrum One",
    chain: arbitrumOneChain,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    fallbackRpcUrls: ["https://arbitrum-one-rpc.publicnode.com"],
    explorerUrl: "https://arbiscan.io",
    maxGasFeeGwei: "2",
    maxPriorityFeeGwei: "0.1",
  },
  {
    id: 57073,
    key: "ink",
    label: "Ink",
    chain: inkChain,
    rpcUrl: "https://rpc-gel.inkonchain.com",
    fallbackRpcUrls: [],
    explorerUrl: "https://explorer.inkonchain.com",
    maxGasFeeGwei: "1",
    maxPriorityFeeGwei: "0.1",
  },
];

export function getChainConfig(chainId: number): ChainConfig {
  const config = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!config) throw new Error(`Unsupported chain id: ${chainId}`);
  return config;
}

export const DEFAULT_CHAIN_ID = robinhoodChain.id;
