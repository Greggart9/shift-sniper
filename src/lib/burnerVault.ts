"use client";

import type { Address, Hex } from "viem";

export interface BurnerAccount {
  id: string;
  label: string;
  address: Address;
  privateKey: Hex;
}

export interface BurnerMetadata {
  id: string;
  label: string;
  address: Address;
}

export interface EncryptedBurnerWallet {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
}

interface StoredBurnerWallet extends BurnerMetadata {
  encrypted: EncryptedBurnerWallet;
}

const STORAGE_KEY = "shift_burner_vault";
const LEGACY_STORAGE_KEY = "shift_burner_wallets";
const PBKDF2_ITERATIONS = 600_000;
const memoryVault = new Map<string, Map<string, BurnerAccount>>();

function ownerKey(owner?: string) {
  return owner?.toLowerCase() ?? "anonymous";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function getMemoryWallets(owner?: string) {
  const key = ownerKey(owner);
  let wallets = memoryVault.get(key);
  if (!wallets) {
    wallets = new Map();
    memoryVault.set(key, wallets);
  }
  return wallets;
}

function readStored(owner?: string): StoredBurnerWallet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${ownerKey(owner)}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((wallet): wallet is StoredBurnerWallet => {
      if (!wallet || typeof wallet !== "object") return false;
      const candidate = wallet as Partial<StoredBurnerWallet>;
      return typeof candidate.id === "string" && typeof candidate.label === "string" &&
        typeof candidate.address === "string" && candidate.encrypted?.version === 1;
    });
  } catch {
    return [];
  }
}

function writeStored(owner: string | undefined, wallets: StoredBurnerWallet[]) {
  const key = `${STORAGE_KEY}:${ownerKey(owner)}`;
  if (wallets.length === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(wallets));
}

export function getBurnerWalletMetadata(owner?: string): BurnerMetadata[] {
  const stored = readStored(owner).map(({ id, label, address }) => ({ id, label, address }));
  const memory = [...getMemoryWallets(owner).values()].map(({ id, label, address }) => ({ id, label, address }));
  return [...stored, ...memory.filter((wallet) => !stored.some((storedWallet) => storedWallet.id === wallet.id))];
}

export function getBurnerWallets(owner?: string): BurnerAccount[] {
  return [...getMemoryWallets(owner).values()];
}

export function getEncryptedBurnerWallets(owner?: string) {
  return readStored(owner);
}

export function setMemoryWallet(owner: string | undefined, wallet: BurnerAccount) {
  getMemoryWallets(owner).set(wallet.id, wallet);
}

export function setMemoryWallets(owner: string | undefined, wallets: BurnerAccount[]) {
  const memoryWallets = getMemoryWallets(owner);
  memoryWallets.clear();
  wallets.forEach((wallet) => memoryWallets.set(wallet.id, wallet));
}

export function clearMemoryWallets(owner?: string) {
  memoryVault.delete(ownerKey(owner));
}

export function removeStoredWallet(owner: string | undefined, id: string) {
  writeStored(owner, readStored(owner).filter((wallet) => wallet.id !== id));
  getMemoryWallets(owner).delete(id);
}

export function hasLegacyPlaintextWallets(owner?: string) {
  if (typeof window === "undefined") return false;
  return !!owner && localStorage.getItem(`${LEGACY_STORAGE_KEY}:${ownerKey(owner)}`) !== null;
}

export function readLegacyPlaintextWallets(owner?: string): BurnerAccount[] {
  if (typeof window === "undefined" || !owner) return [];
  try {
    const raw = localStorage.getItem(`${LEGACY_STORAGE_KEY}:${ownerKey(owner)}`);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((wallet): wallet is BurnerAccount => {
      if (!wallet || typeof wallet !== "object") return false;
      const candidate = wallet as Partial<BurnerAccount>;
      return typeof candidate.id === "string" && typeof candidate.label === "string" &&
        typeof candidate.address === "string" && typeof candidate.privateKey === "string";
    });
  } catch {
    return [];
  }
}

export function discardLegacyPlaintextWallets(owner?: string) {
  if (typeof window !== "undefined" && owner) localStorage.removeItem(`${LEGACY_STORAGE_KEY}:${ownerKey(owner)}`);
}

export async function encryptPrivateKey(privateKey: Hex, passphrase: string): Promise<EncryptedBurnerWallet> {
  if (!passphrase) throw new Error("A passphrase is required.");
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(privateKey));
  return { version: 1, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

export async function decryptPrivateKey(encrypted: EncryptedBurnerWallet, passphrase: string): Promise<Hex> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: base64ToBytes(encrypted.salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(encrypted.iv) }, key, base64ToBytes(encrypted.ciphertext));
  return new TextDecoder().decode(plaintext) as Hex;
}

export async function persistWallets(owner: string | undefined, wallets: BurnerAccount[], passphrase: string) {
  const encryptedWallets = await Promise.all(wallets.map(async (wallet) => ({
    id: wallet.id,
    label: wallet.label,
    address: wallet.address,
    encrypted: await encryptPrivateKey(wallet.privateKey, passphrase),
  })));
  writeStored(owner, encryptedWallets);
}

export function clearStoredWallet(owner?: string) {
  if (typeof window !== "undefined" && owner) localStorage.removeItem(`${STORAGE_KEY}:${ownerKey(owner)}`);
}

export function getLegacyStorageKey(owner?: string) {
  return `${LEGACY_STORAGE_KEY}:${ownerKey(owner)}`;
}
