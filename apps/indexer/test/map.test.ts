import type { VaultAccountData } from "@perpetua/sdk";
import { Keypair } from "@solana/web3.js";
import BN from "bn.js";
import { describe, expect, it } from "vitest";
import { toVaultSummary } from "../src/map.js";

describe("toVaultSummary", () => {
  it("converts an on-chain vault account into a serializable summary", () => {
    const key = () => Keypair.generate().publicKey;
    const data = {
      pool: key(),
      position: key(),
      positionNftMint: key(),
      positionNftAccount: key(),
      tokenAMint: key(),
      tokenBMint: key(),
      tokenAProgram: key(),
      tokenBProgram: key(),
      shareMint: key(),
      totalStaked: new BN(123),
      accFeePerShareA: new BN(0),
      accFeePerShareB: new BN(0),
      carryA: new BN(0),
      carryB: new BN(0),
      totalClaimedA: new BN(9),
      totalClaimedB: new BN(8),
      creator: key(),
      createdAt: new BN(1_700_000_000),
    } as unknown as VaultAccountData;

    const summary = toVaultSummary(data.position, data);
    expect(summary.address).toBe(data.position.toBase58());
    expect(summary.totalStaked).toBe("123");
    expect(summary.totalClaimedA).toBe("9");
    expect(summary.createdAt).toBe(1_700_000_000);
  });
});
