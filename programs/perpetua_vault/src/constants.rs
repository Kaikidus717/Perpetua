use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const STAKE_SEED: &[u8] = b"stake";

pub const FEE_PER_SHARE_PRECISION: u128 = 1_000_000_000_000_000_000;

pub const SHARE_DECIMALS: u8 = 6;

pub const SHARE_SUPPLY: u64 = 1_000_000_000_000;

pub const BPS_DENOMINATOR: u64 = 10_000;

pub const SPL_TOKEN_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

/// SPL Token `SetAuthority` instruction discriminator.
pub const TOKEN_SET_AUTHORITY: u8 = 6;

/// AuthorityType::MintTokens
pub const AUTHORITY_MINT_TOKENS: u8 = 0;

/// AuthorityType::AccountOwner
pub const AUTHORITY_ACCOUNT_OWNER: u8 = 2;

/// Anchor discriminator for DAMM v2 `claim_position_fee`, read from the shipped
/// cp-amm IDL (programs/perpetua_vault/idl/cp_amm.json).
pub const CP_AMM_CLAIM_POSITION_FEE_DISCRIMINATOR: [u8; 8] = [180, 38, 154, 17, 133, 33, 162, 211];

/// Fixed pool authority published in the cp-amm IDL.
pub const CP_AMM_POOL_AUTHORITY: Pubkey = pubkey!("HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC");

/// cp-amm event authority PDA seed.
pub const EVENT_AUTHORITY_SEED: &[u8] = b"__event_authority";

/// Byte offsets inside the DAMM v2 `Position` account, derived from the cp-amm IDL
/// (8-byte discriminator + pool 32 + nft_mint 32 + 2 x 32 checkpoints + 2 x u64).
pub const POSITION_UNLOCKED_OFFSET: usize = 152;
pub const POSITION_VESTED_OFFSET: usize = 168;
pub const POSITION_PERMANENT_LOCK_OFFSET: usize = 184;
pub const POSITION_MIN_LEN: usize = POSITION_PERMANENT_LOCK_OFFSET + 16;
