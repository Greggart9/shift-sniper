import { NextResponse } from "next/server";
import { clearWalletSession } from "@/server/auth";
import { protectApi } from "@/lib/arcjet";

export async function POST(request: Request) {
  const blocked = await protectApi(request, "auth");
  if (blocked) return blocked;
  await clearWalletSession();
  return NextResponse.json({ success: true });
}
