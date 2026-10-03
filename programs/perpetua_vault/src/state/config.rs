use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub protocol_fee_bps: u16,
    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 8 + 32 + 32 + 2 + 1;
}
