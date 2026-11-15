import { PERPETUA_VAULT_IDL } from "@perpetua/sdk";
import { Keypair, type PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { decodeVaultEvents, toVaultEvents } from "../src/events.js";

function discriminator(name: string): Buffer {
  const event = PERPETUA_VAULT_IDL.events.find((entry) => entry.name === name);
  if (!event) throw new Error(`no discriminator for ${name}`);
  return Buffer.from(event.discriminator);
}

function toLog(bytes: Buffer): string {
  return `Program data: ${bytes.toString("base64")}`;
}

function feesClaimedLog(
  vault: PublicKey,
  deltaA: bigint,
  deltaB: bigint,
  totalStaked: bigint,
): string {
  const buffer = Buffer.alloc(8 + 32 + 8 + 8 + 8);
  discriminator("FeesClaimed").copy(buffer, 0);
  vault.toBuffer().copy(buffer, 8);
  buffer.writeBigUInt64LE(deltaA, 40);
  buffer.writeBigUInt64LE(deltaB, 48);
  buffer.writeBigUInt64LE(totalStaked, 56);
  return toLog(buffer);
}

function stakedLog(vault: PublicKey, owner: PublicKey, amount: bigint): string {
  const buffer = Buffer.alloc(8 + 32 + 32 + 8);
  discriminator("Staked").copy(buffer, 0);
  vault.toBuffer().copy(buffer, 8);
  owner.toBuffer().copy(buffer, 40);
  buffer.writeBigUInt64LE(amount, 72);
  return toLog(buffer);
}

describe("decodeVaultEvents", () => {
  it("decodes a FeesClaimed event encoded as a Program data log", () => {
    const vault = Keypair.generate().publicKey;
    const decoded = decodeVaultEvents([feesClaimedLog(vault, 11n, 7n, 1_000n)]);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]?.name).toBe("FeesClaimed");
    expect(decoded[0]?.data.vault).toBe(vault.toBase58());
    expect(decoded[0]?.data.deltaA).toBe("11");
    expect(decoded[0]?.data.totalStaked).toBe("1000");
  });

  it("ignores logs that are not program events", () => {
    expect(decodeVaultEvents(["Program log: Instruction: Stake", "Program consumed 123"])).toEqual(
      [],
    );
  });

  it("attaches signature and slot metadata", () => {
    const vault = Keypair.generate().publicKey;
    const owner = Keypair.generate().publicKey;
    const events = toVaultEvents(decodeVaultEvents([stakedLog(vault, owner, 5n)]), {
      signature: "sig",
      slot: 42,
      blockTime: 1_700_000_000,
    });
    expect(events[0]).toMatchObject({ signature: "sig", slot: 42, name: "Staked" });
    expect(events[0]?.data.owner).toBe(owner.toBase58());
  });
});
