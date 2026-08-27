import { NextResponse } from "next/server";
import { armSniperBatch, disarmSniper, getActiveTasks, getAllSniperStatuses, getSniperStatus } from "@/server/sniper";
import { DEFAULT_CHAIN_ID, getChainConfig } from "@/lib/chains";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    // If a taskId is supplied, return the status for that specific task.
    if (taskId) {
      const status = getSniperStatus(taskId);

      if (!status) {
        return NextResponse.json(
          {
            success: false,
            error: "Task not found.",
          },
          { status: 404 },
        );
      }

      return NextResponse.json({
        success: true,
        status,
      });
    }

    // Otherwise return all active tasks and their current statuses.
    const tasks = getActiveTasks();
    const statuses = getAllSniperStatuses();

    return NextResponse.json({
      success: true,
      tasks,
      statuses,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve sniper status.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { targetContract, chainId, mintPriceEth, maxQuantity, functionName, mode, feeTiersBatch } = body;
    const selectedChainId = chainId === undefined ? DEFAULT_CHAIN_ID : chainId;

    const batches: string[][] = Array.isArray(feeTiersBatch) ? feeTiersBatch : [];

    if (!targetContract) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing targetContract.",
        },
        { status: 400 },
      );
    }

    if (!Number.isInteger(maxQuantity) || maxQuantity < 1) {
      return NextResponse.json(
        {
          success: false,
          error: "maxQuantity must be a positive whole number.",
        },
        { status: 400 },
      );
    }

    if (!mode || !["BURNER", "PRESIGN"].includes(mode)) {
      return NextResponse.json(
        {
          success: false,
          error: "mode must be either BURNER or PRESIGN.",
        },
        { status: 400 },
      );
    }

    if (!Number.isInteger(selectedChainId)) {
      return NextResponse.json({ success: false, error: "chainId must be a supported chain ID." }, { status: 400 });
    }

    try {
      getChainConfig(selectedChainId);
    } catch {
      return NextResponse.json({ success: false, error: "chainId must be a supported chain ID." }, { status: 400 });
    }

    if (batches.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "At least one signed transaction is required.",
        },
        { status: 400 },
      );
    }

    const taskIds = await armSniperBatch(
      targetContract,
      mintPriceEth ?? "0",
      maxQuantity,
      functionName ?? "mint",
      mode,
      batches,
      selectedChainId,
    );

    return NextResponse.json({
      success: true,

      taskId: taskIds[0],

      taskIds,

      message: `Sniper armed successfully. ${taskIds.length} task${taskIds.length === 1 ? "" : "s"} scheduled.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to arm sniper.";

    console.error("[SHIFT BOT] Failed to arm sniper:", error);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const taskId = searchParams.get("taskId");

    if (!taskId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing taskId.",
        },
        { status: 400 },
      );
    }

    const success = disarmSniper(taskId);

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: "Task not found or already completed.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      taskId,
      message: "Sniper disarmed successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to disarm sniper.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
