import { type AnchorProvider, type Idl, Program } from "@coral-xyz/anchor";
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { PERPETUA_VAULT_IDL } from "../idl/perpetua_vault.js";
import type {
  ClaimAccounts,
  ConfigAccountData,
  CreateVaultAccounts,
  StakeAccountData,
  VaultAccountData,
} from "./types.js";

interface IxBuilder {
  accounts<T extends object>(accounts: T): IxBuilder;
  instruction(): Promise<TransactionInstruction>;
}

type Method = (...args: unknown[]) => IxBuilder;

interface AccountClient<T> {
  fetch(address: PublicKey): Promise<T>;
  fetchNullable(address: PublicKey): Promise<T | null>;
  all(): Promise<Array<{ publicKey: PublicKey; account: T }>>;
}

export class PerpetuaVaultClient {
  readonly program: Program<Idl>;
  readonly programId: PublicKey;

  private readonly methods: Record<string, Method>;
  private readonly accounts: Record<string, AccountClient<unknown>>;

  constructor(program: Program<Idl>) {
    this.program = program;
    this.programId = program.programId;
    this.methods = program.methods as unknown as Record<string, Method>;
    this.accounts = program.account as unknown as Record<string, AccountClient<unknown>>;
  }

  static create(provider: AnchorProvider): PerpetuaVaultClient {
    const idl = PERPETUA_VAULT_IDL as unknown as Idl;
    const program = new Program(idl, provider) as unknown as Program<Idl>;
    return new PerpetuaVaultClient(program);
  }

  private method(name: string): Method {
    const method = this.methods[name];
    if (!method) throw new Error(`instruction ${name} is missing from the IDL`);
    return method;
  }

  initConfig(
    accounts: { admin: PublicKey; config: PublicKey; systemProgram: PublicKey },
    protocolFeeBps: number,
  ) {
    return this.method("initConfig")({ protocolFeeBps }).accounts(accounts).instruction();
  }

  createVault(accounts: CreateVaultAccounts) {
    return this.method("createVault")().accounts(accounts).instruction();
  }

  crankClaim(accounts: { caller: PublicKey; config: PublicKey; vault: PublicKey } & ClaimAccounts) {
    return this.method("crankClaim")().accounts(accounts).instruction();
  }

  stake(
    accounts: {
      owner: PublicKey;
      config: PublicKey;
      vault: PublicKey;
      stake: PublicKey;
      shareMint: PublicKey;
      ownerShareAccount: PublicKey;
      vaultShareAccount: PublicKey;
      shareTokenProgram: PublicKey;
      systemProgram: PublicKey;
    } & ClaimAccounts,
    amount: bigint,
  ) {
    return this.method("stake")({ amount: new BN(amount.toString()) })
      .accounts(accounts)
      .instruction();
  }

  unstake(
    accounts: {
      owner: PublicKey;
      config: PublicKey;
      vault: PublicKey;
      stake: PublicKey;
      shareMint: PublicKey;
      ownerShareAccount: PublicKey;
      vaultShareAccount: PublicKey;
      shareTokenProgram: PublicKey;
    } & ClaimAccounts,
    amount: bigint,
  ) {
    return this.method("unstake")({ amount: new BN(amount.toString()) })
      .accounts(accounts)
      .instruction();
  }

  unstakeNoClaim(
    accounts: {
      owner: PublicKey;
      vault: PublicKey;
      stake: PublicKey;
      shareMint: PublicKey;
      ownerShareAccount: PublicKey;
      vaultShareAccount: PublicKey;
      shareTokenProgram: PublicKey;
    },
    amount: bigint,
  ) {
    return this.method("unstakeNoClaim")({ amount: new BN(amount.toString()) })
      .accounts(accounts)
      .instruction();
  }

  harvest(accounts: {
    owner: PublicKey;
    vault: PublicKey;
    stake: PublicKey;
    vaultAAccount: PublicKey;
    vaultBAccount: PublicKey;
    ownerAAccount: PublicKey;
    ownerBAccount: PublicKey;
    tokenAProgram: PublicKey;
    tokenBProgram: PublicKey;
  }) {
    return this.method("harvest")().accounts(accounts).instruction();
  }

  async fetchVault(address: PublicKey): Promise<VaultAccountData> {
    return this.fetch<VaultAccountData>("vault", address);
  }

  async listVaults(): Promise<Array<{ address: PublicKey; account: VaultAccountData }>> {
    const client = this.accounts.vault;
    if (!client) throw new Error("account vault is missing from the IDL");
    const rows = await client.all();
    return rows.map((row) => ({
      address: row.publicKey,
      account: row.account as VaultAccountData,
    }));
  }

  async fetchStake(address: PublicKey): Promise<StakeAccountData> {
    return this.fetch<StakeAccountData>("stake", address);
  }

  async fetchConfig(address: PublicKey): Promise<ConfigAccountData> {
    return this.fetch<ConfigAccountData>("config", address);
  }

  private async fetch<T>(name: string, address: PublicKey): Promise<T> {
    const client = this.accounts[name];
    if (!client) throw new Error(`account ${name} is missing from the IDL`);
    return (await client.fetch(address)) as T;
  }
}
