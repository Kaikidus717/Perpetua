use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::{CP_AMM_POOL_AUTHORITY, CP_AMM_PROGRAM_ID};
use crate::errors::PerpetuaError;
use crate::events::FeesClaimed;
use crate::instructions::touch::{touch, ClaimAccounts};
use crate::state::{Config, Vault};

#[derive(Accounts)]
pub struct CrankClaim<'info> {
    pub caller: Signer<'info>,
    pub config: Account<'info, Config>,
    #[account(mut, has_one = pool)]
    pub vault: Account<'info, Vault>,
    /// CHECK: fixed cp-amm pool authority published in the cp-amm IDL.
    #[account(address = CP_AMM_POOL_AUTHORITY)]
    pub pool_authority: UncheckedAccount<'info>,
    /// CHECK: pinned to `Vault::pool` by the `has_one` constraint.
    pub pool: UncheckedAccount<'info>,
    /// CHECK: DAMM v2 position account.
    #[account(mut)]
    pub position: UncheckedAccount<'info>,
    /// CHECK: position NFT account owned by the vault PDA.
    pub position_nft_account: UncheckedAccount<'info>,
    pub token_a_mint: InterfaceAccount<'info, Mint>,
    pub token_b_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: pool token A vault, validated by cp-amm via `relations`.
    #[account(mut)]
    pub token_a_vault: UncheckedAccount<'info>,
    /// CHECK: pool token B vault, validated by cp-amm via `relations`.
    #[account(mut)]
    pub token_b_vault: UncheckedAccount<'info>,
    /// CHECK: cp-amm event authority PDA.
    pub event_authority: UncheckedAccount<'info>,
    #[account(mut, token::mint = vault.token_a_mint, token::token_program = token_a_program)]
    pub vault_a_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = vault.token_b_mint, token::token_program = token_b_program)]
    pub vault_b_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: protocol treasury owner of the skim destination accounts.
    pub treasury: UncheckedAccount<'info>,
    #[account(mut)]
    pub treasury_a_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub treasury_b_account: InterfaceAccount<'info, TokenAccount>,
    pub token_a_program: Interface<'info, TokenInterface>,
    pub token_b_program: Interface<'info, TokenInterface>,
    /// CHECK: pinned to the DAMM v2 program; see `CP_AMM_PROGRAM_ID`.
    #[account(address = CP_AMM_PROGRAM_ID)]
    pub cp_amm_program: UncheckedAccount<'info>,
}

pub fn handle_crank_claim(ctx: Context<CrankClaim>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.treasury_a_account.owner,
        ctx.accounts.treasury.key(),
        PerpetuaError::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.treasury_b_account.owner,
        ctx.accounts.treasury.key(),
        PerpetuaError::Unauthorized
    );

    let delta = {
        let mut accounts = ClaimAccounts {
            pool_authority: ctx.accounts.pool_authority.to_account_info(),
            pool: ctx.accounts.pool.to_account_info(),
            position: ctx.accounts.position.to_account_info(),
            position_nft_account: ctx.accounts.position_nft_account.to_account_info(),
            token_a_mint: Box::new(ctx.accounts.token_a_mint.clone()),
            token_b_mint: Box::new(ctx.accounts.token_b_mint.clone()),
            token_a_vault: ctx.accounts.token_a_vault.to_account_info(),
            token_b_vault: ctx.accounts.token_b_vault.to_account_info(),
            event_authority: ctx.accounts.event_authority.to_account_info(),
            vault_a_account: Box::new(ctx.accounts.vault_a_account.clone()),
            vault_b_account: Box::new(ctx.accounts.vault_b_account.clone()),
            treasury_a_account: Box::new(ctx.accounts.treasury_a_account.clone()),
            treasury_b_account: Box::new(ctx.accounts.treasury_b_account.clone()),
            token_a_program: ctx.accounts.token_a_program.to_account_info(),
            token_b_program: ctx.accounts.token_b_program.to_account_info(),
            cp_amm_program: ctx.accounts.cp_amm_program.to_account_info(),
        };
        touch(&ctx.accounts.config, &mut ctx.accounts.vault, &mut accounts)?
    };

    emit!(FeesClaimed {
        vault: ctx.accounts.vault.key(),
        delta_a: delta.net_a,
        delta_b: delta.net_b,
        total_staked: ctx.accounts.vault.total_staked,
    });
    Ok(())
}
