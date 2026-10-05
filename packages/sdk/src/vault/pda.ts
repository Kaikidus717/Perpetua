import { EVENT_AUTHORITY_SEED, PROGRAM_IDS } from "@perpetua/shared";
import { PublicKey } from "@solana/web3.js";

const seed = (label: string): Uint8Array => Uint8Array.from(label, (char) => char.charCodeAt(0));

export function findCpAmmEventAuthority(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed(EVENT_AUTHORITY_SEED)],
    new PublicKey(PROGRAM_IDS.dammV2),
  );
}

/// DAMM v2 does not hold a position NFT in an associated token account. The account is a PDA of the
/// cp-amm program seeded by the NFT mint, so the address is a function of the mint alone — no owner
/// argument. Mirrors `derivePositionNftAccount` inside `@meteora-ag/cp-amm-sdk`.
export function findCpAmmPositionNftAccount(nftMint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [seed("position_nft_account"), nftMint.toBytes()],
    new PublicKey(PROGRAM_IDS.dammV2),
  )[0];
}

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
