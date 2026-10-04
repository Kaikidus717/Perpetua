import { CpAmm, type PoolState, type PositionState, getTokenProgram } from "@meteora-ag/cp-amm-sdk";
import { CP_AMM_POOL_AUTHORITY, PROGRAM_IDS } from "@perpetua/shared";
import type { PositionSummary } from "@perpetua/shared";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { type Connection, PublicKey } from "@solana/web3.js";
import { findCpAmmEventAuthority } from "../vault/pda.js";
import type { ClaimAccounts } from "../vault/types.js";

export interface PositionDetail {
  address: string;
  pool: string;
  nftMint: string;
  nftAccount: string;
  positionNftProgram: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenAProgram: string;
  tokenBProgram: string;
  unlockedLiquidity: string;
  vestedLiquidity: string;
  permanentLockedLiquidity: string;
  feeAPending: string;
  feeBPending: string;
}

export interface VaultFeeRefs {
  vault: PublicKey;
  pool: PublicKey;
  position: PublicKey;
  positionNftAccount: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
}

type PositionRow = { position: PublicKey } | PublicKey;

function rowAddress(row: PositionRow): PublicKey {
  return row instanceof PublicKey ? row : row.position;
}

export class DammV2Adapter {
  readonly cpAmm: CpAmm;

  constructor(readonly connection: Connection) {
    this.cpAmm = new CpAmm(connection);
  }

  async walletPositions(owner: PublicKey): Promise<PositionSummary[]> {
    const details = await this.walletPositionDetails(owner);
    return details.map((detail) => ({
      address: detail.address,
      pool: detail.pool,
      nftMint: detail.nftMint,
      tokenAMint: detail.tokenAMint,
      tokenBMint: detail.tokenBMint,
      unlockedLiquidity: detail.unlockedLiquidity,
      vestedLiquidity: detail.vestedLiquidity,
      permanentLockedLiquidity: detail.permanentLockedLiquidity,
    }));
  }

  async fetchPosition(address: PublicKey): Promise<PositionState> {
    return this.cpAmm.fetchPositionState(address);
  }

  async fetchPool(address: PublicKey): Promise<PoolState> {
    return this.cpAmm.fetchPoolState(address);
  }

  async positionDetail(address: PublicKey): Promise<PositionDetail> {
    const state = await this.fetchPosition(address);
    const poolState = await this.fetchPool(state.pool);
    return {
      address: address.toBase58(),
      pool: state.pool.toBase58(),
      nftMint: state.nftMint.toBase58(),
      nftAccount: this.positionNftAccount(state.pool, state.nftMint).toBase58(),
      positionNftProgram: TOKEN_2022_PROGRAM_ID.toBase58(),
      tokenAMint: poolState.tokenAMint.toBase58(),
      tokenBMint: poolState.tokenBMint.toBase58(),
      tokenAProgram: getTokenProgram(poolState.tokenAFlag).toBase58(),
      tokenBProgram: getTokenProgram(poolState.tokenBFlag).toBase58(),
      unlockedLiquidity: state.unlockedLiquidity.toString(),
      vestedLiquidity: state.vestedLiquidity.toString(),
      permanentLockedLiquidity: state.permanentLockedLiquidity.toString(),
      feeAPending: state.feeAPending.toString(),
      feeBPending: state.feeBPending.toString(),
    };
  }

  async walletPositionDetails(owner: PublicKey): Promise<PositionDetail[]> {
    const rows = (await this.cpAmm.getPositionsByUser(owner)) as PositionRow[];
    const details: PositionDetail[] = [];
    for (const row of rows) {
      details.push(await this.positionDetail(rowAddress(row)));
    }
    return details;
  }

  positionNftAccount(pool: PublicKey, nftMint: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(nftMint, pool, true, TOKEN_2022_PROGRAM_ID);
  }

  isPermanentLocked(state: PositionState): boolean {
    return this.cpAmm.isPermanentLockedPosition(state);
  }

  /// Everything the vault program needs to CPI `claim_position_fee`.
  async claimAccountsFor(refs: VaultFeeRefs, treasury: PublicKey): Promise<ClaimAccounts> {
    const poolState = await this.fetchPool(refs.pool);
    const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
    const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

    return {
      poolAuthority: new PublicKey(CP_AMM_POOL_AUTHORITY),
      pool: refs.pool,
      position: refs.position,
      positionNftAccount: refs.positionNftAccount,
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      eventAuthority: findCpAmmEventAuthority()[0],
      vaultAAccount: getAssociatedTokenAddressSync(
        poolState.tokenAMint,
        refs.vault,
        true,
        tokenAProgram,
      ),
      vaultBAccount: getAssociatedTokenAddressSync(
        poolState.tokenBMint,
        refs.vault,
        true,
        tokenBProgram,
      ),
      treasury,
      treasuryAAccount: getAssociatedTokenAddressSync(
        poolState.tokenAMint,
        treasury,
        true,
        tokenAProgram,
      ),
      treasuryBAccount: getAssociatedTokenAddressSync(
        poolState.tokenBMint,
        treasury,
        true,
        tokenBProgram,
      ),
      tokenAProgram,
      tokenBProgram,
      cpAmmProgram: new PublicKey(PROGRAM_IDS.dammV2),
    };
  }
}
