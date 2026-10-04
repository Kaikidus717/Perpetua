use anchor_lang::prelude::*;

pub mod constants;
pub mod cpi;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

// `#[derive(Accounts)]` emits `__client_accounts_*` / `__cpi_client_accounts_*` next to each
// accounts struct, but `#[program]` resolves them at the crate root, so re-export the lot.
pub use instructions::*;

declare_id!("3QoX6JPhvcNpHbvdNsumQShrfUu7bx4YpkLKoGtdvHit");

#[program]
pub mod perpetua_vault {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, protocol_fee_bps: u16) -> Result<()> {
        handle_init_config(ctx, protocol_fee_bps)
    }

    pub fn create_vault(ctx: Context<CreateVault>) -> Result<()> {
        handle_create_vault(ctx)
    }

    pub fn crank_claim(ctx: Context<CrankClaim>) -> Result<()> {
        handle_crank_claim(ctx)
    }

    pub fn stake(ctx: Context<StakeContext>, amount: u64) -> Result<()> {
        handle_stake(ctx, amount)
    }

    pub fn unstake(ctx: Context<UnstakeContext>, amount: u64) -> Result<()> {
        handle_unstake(ctx, amount)
    }

    pub fn unstake_no_claim(ctx: Context<UnstakeNoClaim>, amount: u64) -> Result<()> {
        handle_unstake_no_claim(ctx, amount)
    }

    pub fn harvest(ctx: Context<Harvest>) -> Result<()> {
        handle_harvest(ctx)
    }
}
