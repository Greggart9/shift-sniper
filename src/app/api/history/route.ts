import { NextResponse } from "next/server";
import { getTradeHistory } from "@/server/sniper";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ success: true, history: getTradeHistory() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to retrieve execution history.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
