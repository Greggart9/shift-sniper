import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { Address } from "viem";

const databasePath = process.env.SNIPER_DB_PATH ?? path.join(process.cwd(), "data", "shift-sniper.sqlite");
mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new Database(databasePath);
database.exec(`
  CREATE TABLE IF NOT EXISTS wallet_nonces (address TEXT PRIMARY KEY, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS wallet_sessions (token TEXT PRIMARY KEY, address TEXT NOT NULL, expires_at INTEGER NOT NULL);
`);

const nonceLifetimeMs = 5 * 60 * 1000;
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const sessionCookie = "shift_wallet_session";

function normalizeAddress(address: string): Address {
  return address.toLowerCase() as Address;
}

export function createWalletNonce(address: string) {
  const normalized = normalizeAddress(address);
  const nonce = randomBytes(32).toString("hex");
  database.prepare("INSERT OR REPLACE INTO wallet_nonces (address, nonce, expires_at) VALUES (?, ?, ?)").run(
    normalized,
    nonce,
    Date.now() + nonceLifetimeMs,
  );
  return nonce;
}

export function consumeWalletNonce(address: string, nonce: string) {
  const normalized = normalizeAddress(address);
  const row = database.prepare("SELECT nonce, expires_at FROM wallet_nonces WHERE address = ?").get(normalized) as
    | { nonce: string; expires_at: number }
    | undefined;
  if (!row || row.nonce !== nonce || row.expires_at < Date.now()) return false;
  database.prepare("DELETE FROM wallet_nonces WHERE address = ?").run(normalized);
  return true;
}

export function createWalletSession(address: string) {
  const token = randomBytes(32).toString("hex");
  database.prepare("INSERT INTO wallet_sessions (token, address, expires_at) VALUES (?, ?, ?)").run(
    token,
    normalizeAddress(address),
    Date.now() + sessionLifetimeMs,
  );
  return token;
}

export async function getAuthenticatedWallet() {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) return undefined;
  const row = database.prepare("SELECT address, expires_at FROM wallet_sessions WHERE token = ?").get(token) as
    | { address: Address; expires_at: number }
    | undefined;
  if (!row || row.expires_at < Date.now()) {
    if (row) database.prepare("DELETE FROM wallet_sessions WHERE token = ?").run(token);
    return undefined;
  }
  return row.address;
}

export async function setWalletSession(token: string) {
  (await cookies()).set(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionLifetimeMs / 1000,
  });
}

export async function clearWalletSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  if (token) database.prepare("DELETE FROM wallet_sessions WHERE token = ?").run(token);
  cookieStore.delete(sessionCookie);
}

export function walletAuthMessage(address: string, nonce: string) {
  return `Shift Sniper wants you to sign in.\n\nWallet: ${normalizeAddress(address)}\nNonce: ${nonce}`;
}
