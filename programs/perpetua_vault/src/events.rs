use anchor_lang::prelude::*;

#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub protocol_fee_bps: u16,
}

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub pool: Pubkey,
    pub position: Pubkey,
    pub share_mint: Pubkey,
    pub creator: Pubkey,
}

#[event]
pub struct FeesClaimed {
    pub vault: Pubkey,
    pub delta_a: u64,
    pub delta_b: u64,
    pub total_staked: u64,
}

#[event]
pub struct Staked {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Unstaked {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Harvested {
    pub vault: Pubkey,
    pub owner: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
}
