import { NextResponse } from "next/server";
import { getTradeHistory } from "@/server/sniper";
import { getAuthenticatedWallet } from "@/server/auth";
import { protectApi } from "@/lib/arcjet";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ownerAddress = await getAuthenticatedWallet();
    if (!ownerAddress) return NextResponse.json({ success: false, error: "Wallet authentication required." }, { status: 401 });
    const blocked = await protectApi(request, "history", ownerAddress);
    if (blocked) return blocked;
    return NextResponse.json({ success: true, history: getTradeHistory(ownerAddress) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to retrieve execution history.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
