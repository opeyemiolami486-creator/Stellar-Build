import { StrKey } from "@stellar/stellar-sdk";

export function isValidStellarAddress(address: string | undefined | null): boolean {
  const normalized = address?.trim();
  if (!normalized) return false;

  return StrKey.isValidEd25519PublicKey(normalized);
}
