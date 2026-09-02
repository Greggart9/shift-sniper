export const WALLET_STORAGE_KEYS = {
  burners: "shift_burner_wallets",
  activeBurner: "shift_active_burner_id",
  taskIds: "shift_sniper_task_ids",
  config: "shift_sniper_config",
} as const;

export function walletStorageKey(key: string, address?: string) {
  const normalizedAddress = address?.toLowerCase();
  return `${key}:${normalizedAddress ?? "anonymous"}`;
}
