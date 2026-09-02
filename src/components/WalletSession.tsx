"use client";

import { useEffect, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { toast } from "sonner";

export default function WalletSession() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const lastAddress = useRef<string | undefined>(undefined);

  useEffect(() => {
    const normalizedAddress = address?.toLowerCase();
    if (!isConnected || !normalizedAddress) {
      if (lastAddress.current) {
        void fetch("/api/auth/logout", { method: "POST" });
        lastAddress.current = undefined;
      }
      return;
    }
    if (lastAddress.current === normalizedAddress) return;
    lastAddress.current = normalizedAddress;

    let cancelled = false;
    void (async () => {
      try {
        const nonceResponse = await fetch("/api/auth/nonce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const nonceData = await nonceResponse.json();
        if (!nonceResponse.ok || !nonceData.success) throw new Error(nonceData.error ?? "Could not start wallet authentication.");
        const signature = await signMessageAsync({ message: nonceData.message });
        const loginResponse = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, nonce: nonceData.nonce, signature }),
        });
        const loginData = await loginResponse.json();
        if (!loginResponse.ok || !loginData.success) throw new Error(loginData.error ?? "Wallet authentication failed.");
        if (!cancelled) window.dispatchEvent(new CustomEvent("wallet-authenticated", { detail: normalizedAddress }));
      } catch (error) {
        if (!cancelled) {
          lastAddress.current = undefined;
          toast.error(error instanceof Error ? error.message : "Wallet authentication failed.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, isConnected, signMessageAsync]);

  return null;
}
