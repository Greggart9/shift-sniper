import { NextResponse } from "next/server";
import { protectApi } from "@/lib/arcjet";
import { parseTransaction, recoverTransactionAddress, type Hex } from "viem";
import { getChainConfig } from "@/lib/chains";
import { getPublicClient } from "@/lib/viem";

interface SimulationRequest {
  serializedTransaction?: string;
  chainId?: number;
}

export async function POST(request: Request) {
  const blocked = await protectApi(request, "expensive-read");
  if (blocked) return blocked;
  try {
    const body = (await request.json()) as SimulationRequest;
    const serializedTransaction = body.serializedTransaction;
    const chainId = body.chainId;

    if (!serializedTransaction || !serializedTransaction.startsWith("0x")) {
      return NextResponse.json({ success: false, status: "UNAVAILABLE", error: "A signed transaction is required." }, { status: 400 });
    }

    if (typeof chainId !== "number" || !Number.isInteger(chainId)) {
      return NextResponse.json({ success: false, status: "UNAVAILABLE", error: "A valid chain ID is required." }, { status: 400 });
    }

    const selectedChainId = chainId;
    const chain = getChainConfig(selectedChainId);
    const client = getPublicClient(chain.id);
    const transaction = parseTransaction(serializedTransaction as Hex);
    const sender = await recoverTransactionAddress({
      serializedTransaction: serializedTransaction as Parameters<typeof recoverTransactionAddress>[0]["serializedTransaction"],
    });

    if (!transaction.to || transaction.data === undefined) {
      return NextResponse.json({ success: false, status: "UNAVAILABLE", error: "The signed transaction has no callable target." });
    }

    const result = await client.call({
      account: sender,
      to: transaction.to,
      data: transaction.data,
      value: transaction.value,
      gas: transaction.gas,
    });

    return NextResponse.json({
      success: true,
      status: "PASS",
      sender,
      target: transaction.to,
      value: transaction.value?.toString() ?? "0",
      gas: transaction.gas?.toString(),
      returnData: result.data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simulation reverted or could not be completed.";
    return NextResponse.json({ success: false, status: "REVERT", error: message });
  }
}
