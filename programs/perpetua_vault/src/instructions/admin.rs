use anchor_lang::prelude::*;

use crate::constants::{CONFIG_SEED, FLAG_COMPOUNDING_MODE, FLAG_LOW_LIQUIDITY, FLAG_PAUSABLE_MINT};
use crate::constants::{FLAG_PERMANENT_DELEGATE_MINT, FLAG_TRANSFER_FEE_MINT, FLAG_YOUNG_POOL};
use crate::errors::PerpetuaError;
use crate::events::{EntryPaused, RiskFlagsSet};
use crate::state::{Config, Vault};

pub const ALL_RISK_FLAGS: u32 = FLAG_COMPOUNDING_MODE
    | FLAG_PAUSABLE_MINT
    | FLAG_PERMANENT_DELEGATE_MINT
    | FLAG_TRANSFER_FEE_MINT
    | FLAG_YOUNG_POOL
    | FLAG_LOW_LIQUIDITY;

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
}

/// Pauses or unpauses entry. `create_vault` and `stake` honour this; exits never do.
pub fn handle_set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused_entry = paused;
    emit!(EntryPaused { paused });
    Ok(())
}

#[derive(Accounts)]
pub struct SetRiskFlags<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
}

/// Re-settable by the admin because pool liquidity and age move after creation.
pub fn handle_set_risk_flags(ctx: Context<SetRiskFlags>, flags: u32) -> Result<()> {
    require!(flags & !ALL_RISK_FLAGS == 0, PerpetuaError::Unauthorized);
    ctx.accounts.vault.risk_flags = flags;
    emit!(RiskFlagsSet {
        vault: ctx.accounts.vault.key(),
        flags,
    });
    Ok(())
}
