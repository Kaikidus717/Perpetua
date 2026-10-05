use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub protocol_fee_bps: u16,
    pub bump: u8,
    /// Pauses `create_vault` and `stake` only. Exits can never be paused.
    pub paused_entry: bool,
}

impl Config {
    pub const LEN: usize = 8 + 32 + 32 + 2 + 1 + 1;
}
