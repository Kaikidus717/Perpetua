import { PublicKey } from "@solana/web3.js";

const seed = (label: string): Uint8Array => Uint8Array.from(label, (char) => char.charCodeAt(0));

export function findConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([seed("config")], programId);
}

export function findVaultPda(programId: PublicKey, position: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([seed("vault"), position.toBytes()], programId);
}

export function findStakePda(
  programId: PublicKey,
  vault: PublicKey,
  owner: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed("stake"), vault.toBytes(), owner.toBytes()],
    programId,
  );
}
