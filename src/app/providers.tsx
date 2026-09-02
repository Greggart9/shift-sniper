"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import {
  base,
  braveWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet,
  zerionWallet,
} from "@rainbow-me/rainbowkit/wallets";
import "@rainbow-me/rainbowkit/styles.css";
import { arbitrumOneChain, baseChain, ethereumChain, inkChain, robinhoodChain } from "@/lib/chains";
import WalletSession from "@/components/WalletSession";

// Setup Wagmi + RainbowKit Configuration
const wallets = [
  {
    groupName: "Popular",
    wallets: [safeWallet, rainbowWallet, base, metaMaskWallet, walletConnectWallet, rabbyWallet, braveWallet, zerionWallet],
  },
];

const config = getDefaultConfig({
  appName: "Shift Sniper",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID as string,
  chains: [robinhoodChain, ethereumChain, baseChain, arbitrumOneChain, inkChain],
  wallets,
  ssr: true, // Required for Next.js App Router
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WalletSession />
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#C5E000", // Shift Lime
            accentColorForeground: "#0F172A", // Shift Navy
            borderRadius: "medium",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
