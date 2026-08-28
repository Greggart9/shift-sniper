import { encodePacked, isHex, keccak256, type Address, type Hex } from "viem";

export type WalletEligibility = "VERIFIED" | "NOT_VERIFIED" | "UNKNOWN";

function hashPair(left: Hex, right: Hex): Hex {
  const ordered = left.toLowerCase() <= right.toLowerCase() ? [left, right] : [right, left];
  return keccak256(encodePacked(["bytes32", "bytes32"], ordered as [Hex, Hex]));
}

export function verifyAddressMerkleProof(address: Address, root: string, proof: string[]): boolean | undefined {
  if (!isHex(root, { strict: true }) || root.length !== 66 || proof.some((item) => !isHex(item, { strict: true }) || item.length !== 66)) {
    return undefined;
  }

  let hash = keccak256(encodePacked(["address"], [address]));
  for (const sibling of proof as Hex[]) {
    hash = hashPair(hash, sibling);
  }

  return hash.toLowerCase() === root.toLowerCase();
}

export function parseProofsJson(value: string): Record<string, string[]> | undefined {
  if (!value.trim()) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;

    const result: Record<string, string[]> = {};
    for (const [address, proof] of Object.entries(parsed)) {
      if (!Array.isArray(proof) || proof.some((item) => typeof item !== "string")) return undefined;
      result[address.toLowerCase()] = proof;
    }
    return result;
  } catch {
    return undefined;
  }
}

export function getWalletEligibility(
  address: Address,
  phase: "PUBLIC" | "GUARANTEED_WL" | "FCFS_WL",
  root: string,
  proofsJson: string,
): WalletEligibility {
  if (phase === "PUBLIC") return "UNKNOWN";
  if (!root.trim() || !proofsJson.trim()) return "UNKNOWN";

  const proofs = parseProofsJson(proofsJson);
  if (!proofs) return "UNKNOWN";

  const proof = proofs[address.toLowerCase()];
  if (!proof) return "NOT_VERIFIED";

  const verified = verifyAddressMerkleProof(address, root, proof);
  return verified === undefined ? "UNKNOWN" : verified ? "VERIFIED" : "NOT_VERIFIED";
}
