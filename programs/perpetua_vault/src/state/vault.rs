use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    pub pool: Pubkey,
    pub position: Pubkey,
    pub position_nft_mint: Pubkey,
    pub position_nft_account: Pubkey,
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_a_program: Pubkey,
    pub token_b_program: Pubkey,
    pub share_mint: Pubkey,
    pub total_staked: u64,
    pub acc_fee_per_share_a: u128,
    pub acc_fee_per_share_b: u128,
    pub carry_a: u64,
    pub carry_b: u64,
    pub total_claimed_a: u64,
    pub total_claimed_b: u64,
    pub creator: Pubkey,
    pub created_at: i64,
    pub bump: u8,
    /// Bitmask of `FLAG_*` constants in `constants.rs`.
    pub risk_flags: u32,
}

impl Vault {
    pub const LEN: usize = 8 + (32 * 9) + 8 + 16 + 16 + (8 * 6) + 32 + 8 + 1 + 4;
}
