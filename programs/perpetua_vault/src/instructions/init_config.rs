use anchor_lang::prelude::*;

use crate::constants::CONFIG_SEED;
use crate::events::ConfigInitialized;
use crate::state::Config;

#[derive(Accounts)]
pub struct InitConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = Config::LEN, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_config(ctx: Context<InitConfig>, protocol_fee_bps: u16) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.treasury = ctx.accounts.admin.key();
    config.protocol_fee_bps = protocol_fee_bps;
    config.bump = ctx.bumps.config;

    emit!(ConfigInitialized {
        admin: config.admin,
        protocol_fee_bps,
    });
    Ok(())
}
