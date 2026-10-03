use anchor_lang::prelude::*;

pub mod constants;
pub mod cpi;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

use instructions::crank_claim::{self, CrankClaim};
use instructions::create_vault::{self, CreateVault};
use instructions::harvest::{self, Harvest};
use instructions::init_config::{self, InitConfig};
use instructions::stake::{self, StakeContext};
use instructions::unstake::{self, UnstakeContext, UnstakeNoClaim};

declare_id!("3QoX6JPhvcNpHbvdNsumQShrfUu7bx4YpkLKoGtdvHit");

#[program]
pub mod perpetua_vault {
    use super::*;

    pub fn init_config(ctx: Context<InitConfig>, protocol_fee_bps: u16) -> Result<()> {
        init_config::handler(ctx, protocol_fee_bps)
    }

    pub fn create_vault(ctx: Context<CreateVault>) -> Result<()> {
        create_vault::handler(ctx)
    }

    pub fn crank_claim(ctx: Context<CrankClaim>) -> Result<()> {
        crank_claim::handler(ctx)
    }

    pub fn stake(ctx: Context<StakeContext>, amount: u64) -> Result<()> {
        stake::handler(ctx, amount)
    }

    pub fn unstake(ctx: Context<UnstakeContext>, amount: u64) -> Result<()> {
        unstake::handler(ctx, amount)
    }

    pub fn unstake_no_claim(ctx: Context<UnstakeNoClaim>, amount: u64) -> Result<()> {
        unstake::handler_no_claim(ctx, amount)
    }

    pub fn harvest(ctx: Context<Harvest>) -> Result<()> {
        harvest::handler(ctx)
    }
}
