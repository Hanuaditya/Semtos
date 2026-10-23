import { NextResponse } from 'next/server';

// Global in-memory store across Next.js dev/prod worker invocations
if (!globalThis.__SEMTOS_V2X_STATE__) {
  globalThis.__SEMTOS_V2X_STATE__ = {
    snapshot: null,
    lastUpdated: 0,
    pendingCommands: [],
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const consumeCommands = searchParams.get('consumeCommands') === '1';

  const store = globalThis.__SEMTOS_V2X_STATE__;
  const commands = consumeCommands ? [...store.pendingCommands] : [];
  if (consumeCommands) {
    store.pendingCommands = [];
  }

  return NextResponse.json({
    ok: true,
    snapshot: store.snapshot,
    lastUpdated: store.lastUpdated,
    commands,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const store = globalThis.__SEMTOS_V2X_STATE__;

    if (body.type === 'SNAPSHOT' && body.payload) {
      store.snapshot = body.payload;
      store.lastUpdated = Date.now();
      return NextResponse.json({ ok: true });
    }

    if (body.type === 'COMMAND' && body.command) {
      store.pendingCommands.push({
        id: Date.now() + Math.random(),
        command: body.command,
        payload: body.payload || {},
        timestamp: Date.now(),
      });
      // Keep queue bounded
      if (store.pendingCommands.length > 25) {
        store.pendingCommands.shift();
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'Invalid message type' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
