import { NextResponse } from "next/server";
import { isAddress, verifyMessage } from "viem";
import { consumeWalletNonce, createWalletSession, setWalletSession, walletAuthMessage } from "@/server/auth";
import { protectApi } from "@/lib/arcjet";

export async function POST(request: Request) {
  const blocked = await protectApi(request, "auth");
  if (blocked) return blocked;
  const { address, nonce, signature } = (await request.json()) as {
    address?: string;
    nonce?: string;
    signature?: `0x${string}`;
  };
  if (!address || !isAddress(address) || !nonce || !signature) {
    return NextResponse.json({ success: false, error: "Wallet authentication data is incomplete." }, { status: 400 });
  }
  if (!consumeWalletNonce(address, nonce)) {
    return NextResponse.json({ success: false, error: "Nonce is invalid or expired." }, { status: 401 });
  }
  const valid = await verifyMessage({ address: address as `0x${string}`, message: walletAuthMessage(address, nonce), signature });
  if (!valid) {
    return NextResponse.json({ success: false, error: "Wallet signature could not be verified." }, { status: 401 });
  }
  await setWalletSession(createWalletSession(address));
  return NextResponse.json({ success: true, address: address.toLowerCase() });
}
