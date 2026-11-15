import { Keypair, type PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { shouldCrank } from "../src/decide.js";
import { Keeper } from "../src/keeper.js";
import type { CrankPort, VaultRef } from "../src/ports.js";

describe("shouldCrank", () => {
  it("cranks when claimable fees reach the threshold", () => {
    expect(shouldCrank(12, 10).crank).toBe(true);
  });

  it("skips when below the threshold", () => {
    expect(shouldCrank(3, 10).crank).toBe(false);
  });

  it("cranks on every tick when the threshold is disabled", () => {
    expect(shouldCrank(0, 0).crank).toBe(true);
  });
});

class FakePort implements CrankPort {
  cranked: string[] = [];
  constructor(
    private readonly refs: VaultRef[],
    private readonly claimable: bigint,
  ) {}

  async listVaultRefs(): Promise<VaultRef[]> {
    return this.refs;
  }

  async claimableBaseUnits(): Promise<bigint> {
    return this.claimable;
  }

  async crank(vault: PublicKey): Promise<string> {
    const signature = `sig-${vault.toBase58()}`;
    this.cranked.push(vault.toBase58());
    return signature;
  }
}

describe("Keeper", () => {
  const ref = (): VaultRef => ({
    address: Keypair.generate().publicKey,
    pool: Keypair.generate().publicKey,
    position: Keypair.generate().publicKey,
    totalStaked: 0n,
  });

  it("cranks every vault that clears the threshold", async () => {
    const port = new FakePort([ref(), ref()], 100n);
    const keeper = new Keeper(port, { thresholdBaseUnits: 10n, intervalMs: 1000 });
    const summary = await keeper.runOnce();
    expect(summary.considered).toBe(2);
    expect(summary.cranked).toHaveLength(2);
  });

  it("skips all vaults when below the threshold", async () => {
    const port = new FakePort([ref()], 1n);
    const keeper = new Keeper(port, { thresholdBaseUnits: 10n, intervalMs: 1000 });
    const summary = await keeper.runOnce();
    expect(summary.cranked).toEqual([]);
    expect(port.cranked).toEqual([]);
  });
});
