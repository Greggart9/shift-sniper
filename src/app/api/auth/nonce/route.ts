import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { createWalletNonce, walletAuthMessage } from "@/server/auth";
import { protectApi } from "@/lib/arcjet";

export async function POST(request: Request) {
  const blocked = await protectApi(request, "auth");
  if (blocked) return blocked;
  const { address } = (await request.json()) as { address?: string };
  if (!address || !isAddress(address)) {
    return NextResponse.json({ success: false, error: "A valid wallet address is required." }, { status: 400 });
  }
  const nonce = createWalletNonce(address);
  return NextResponse.json({ success: true, message: walletAuthMessage(address, nonce), nonce });
}
