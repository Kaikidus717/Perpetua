use anchor_lang::prelude::*;

#[account]
pub struct Stake {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
    pub debt_a: u128,
    pub debt_b: u128,
    pub pending_a: u64,
    pub pending_b: u64,
    pub bump: u8,
}

impl Stake {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 16 + 16 + 8 + 8 + 1;
}
