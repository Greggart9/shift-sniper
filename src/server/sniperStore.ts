import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import type { SnipeTask, TradeLog } from "@/server/sniper";

const databasePath = process.env.SNIPER_DB_PATH ?? path.join(process.cwd(), "data", "shift-sniper.sqlite");

mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.exec(`
  CREATE TABLE IF NOT EXISTS sniper_tasks (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trade_history (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    owner_address TEXT
  );
`);

try {
  database.exec("ALTER TABLE trade_history ADD COLUMN owner_address TEXT");
} catch {
  // Existing databases already have the ownership column.
}

const upsertTaskStatement = database.prepare(`
  INSERT INTO sniper_tasks (id, payload, is_active, updated_at)
  VALUES (@id, @payload, @isActive, @updatedAt)
  ON CONFLICT(id) DO UPDATE SET
    payload = excluded.payload,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at
`);

const getTasksStatement = database.prepare(`
  SELECT payload FROM sniper_tasks ORDER BY updated_at DESC
`);

const getActiveTasksStatement = database.prepare(`
  SELECT payload FROM sniper_tasks WHERE is_active = 1 ORDER BY updated_at DESC
`);

const insertTradeStatement = database.prepare(`
  INSERT OR REPLACE INTO trade_history (id, payload, created_at, owner_address)
  VALUES (@id, @payload, @createdAt, @ownerAddress)
`);

const getTradesStatement = database.prepare(`
  SELECT payload FROM trade_history ORDER BY created_at ASC
`);

const getOwnerTradesStatement = database.prepare(`
  SELECT payload FROM trade_history WHERE owner_address = @ownerAddress ORDER BY created_at ASC
`);

const trimTradesStatement = database.prepare(`
  DELETE FROM trade_history
  WHERE id NOT IN (
    SELECT id FROM trade_history ORDER BY created_at DESC LIMIT @limit
  )
`);

function parsePayload<T>(payload: string): T {
  return JSON.parse(payload) as T;
}

export function saveTask(task: SnipeTask, isActive: boolean) {
  upsertTaskStatement.run({
    id: task.id,
    payload: JSON.stringify(task),
    isActive: isActive ? 1 : 0,
    updatedAt: task.updatedAt,
  });
}

export function loadTasks(): SnipeTask[] {
  return (getTasksStatement.all() as { payload: string }[]).map(({ payload }) => parsePayload<SnipeTask>(payload));
}

export function loadActiveTasks(): SnipeTask[] {
  return (getActiveTasksStatement.all() as { payload: string }[]).map(({ payload }) =>
    parsePayload<SnipeTask>(payload),
  );
}

export function saveTrade(trade: TradeLog, limit: number) {
  insertTradeStatement.run({
    id: trade.id,
    payload: JSON.stringify(trade),
    createdAt: trade.timestamp,
    ownerAddress: trade.ownerAddress?.toLowerCase() ?? null,
  });
  trimTradesStatement.run({ limit });
}

export function loadTrades(): TradeLog[] {
  return (getTradesStatement.all() as { payload: string }[]).map(({ payload }) => parsePayload<TradeLog>(payload));
}

export function loadTradesForOwner(ownerAddress: string): TradeLog[] {
  return (getOwnerTradesStatement.all({ ownerAddress: ownerAddress.toLowerCase() }) as { payload: string }[]).map(
    ({ payload }) => parsePayload<TradeLog>(payload),
  );
}
