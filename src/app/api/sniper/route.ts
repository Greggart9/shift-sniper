import { NextResponse } from 'next/server';
import { armSniperBatch, disarmSniper, getActiveTasks } from '@/server/sniper';

export async function GET() {
  const tasks = getActiveTasks();
  return NextResponse.json({ success: true, tasks });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetContract, mintPriceEth, maxQuantity, functionName, mode, feeTiersBatch } = body;

    const batches: string[][] = Array.isArray(feeTiersBatch) ? feeTiersBatch : [];

    const taskIds = await armSniperBatch(targetContract, mintPriceEth, maxQuantity, functionName, mode, batches);

    return NextResponse.json({ success: true, taskId: taskIds[0], taskIds });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return NextResponse.json({ success: false, error: 'Missing taskId' }, { status: 400 });
  }

  const success = disarmSniper(taskId);
  return NextResponse.json({ success });
}