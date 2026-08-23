import { NextResponse } from 'next/server';
import { armSniper, disarmSniper, getActiveTasks } from '@/server/sniper';
import { isAddress } from 'viem';

// 1. GET: Fetch all currently active sniper tasks
export async function GET() {
  try {
    const tasks = getActiveTasks();
    return NextResponse.json({ success: true, tasks });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch tasks.' },
      { status: 500 }
    );
  }
}

// 2. POST: Arm a new sniper task
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetContract, mintPriceEth, maxQuantity, functionName, mode, burnerPrivateKey, signedPayload } = body;

    // Validation
    if (!targetContract || !isAddress(targetContract)) {
      return NextResponse.json({ success: false, error: 'Invalid target contract address.' }, { status: 400 });
    }
    if (!maxQuantity || maxQuantity < 1) {
      return NextResponse.json({ success: false, error: 'Max quantity must be at least 1.' }, { status: 400 });
    }

    if (mode === 'BURNER') {
      if (!burnerPrivateKey || typeof burnerPrivateKey !== 'string' || !burnerPrivateKey.startsWith('0x')) {
        return NextResponse.json({ success: false, error: 'No active burner wallet found.' }, { status: 400 });
      }
    } else if (mode === 'PRESIGN') {
      if (!signedPayload || typeof signedPayload !== 'string' || !signedPayload.startsWith('0x')) {
        return NextResponse.json({ success: false, error: 'Missing signed transaction payload.' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ success: false, error: 'Invalid execution mode.' }, { status: 400 });
    }

    // Arm the engine and get the unique Task ID
    const taskId = armSniper(
      targetContract, 
      mintPriceEth || '0', 
      maxQuantity, 
      functionName || 'mint', 
      mode, 
      burnerPrivateKey, 
      signedPayload
    );

    return NextResponse.json({
      success: true,
      message: `Sniper armed in ${mode} mode.`,
      taskId,
      status: 'ARMED'
    });
  } catch (error: any) {
    console.error('API Error in POST /api/sniper:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// 3. DELETE: Disarm a specific task by ID
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ success: false, error: 'Missing taskId parameter.' }, { status: 400 });
    }

    const removed = disarmSniper(taskId);

    if (removed) {
      return NextResponse.json({ success: true, message: 'Task successfully disarmed.', status: 'DISARMED' });
    } else {
      return NextResponse.json({ success: false, error: 'Task not found or already executed.' }, { status: 404 });
    }
  } catch (error: any) {
    console.error('API Error in DELETE /api/sniper:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}