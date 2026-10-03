use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::{STAKE_SEED, VAULT_SEED};
use crate::errors::PerpetuaError;
use crate::events::Harvested;
use crate::instructions::touch::settle;
use crate::state::{Stake, Vault};

#[derive(Accounts)]
pub struct Harvest<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(
        mut,
        has_one = vault,
        has_one = owner,
        seeds = [STAKE_SEED, vault.key().as_ref(), owner.key().as_ref()],
        bump = stake.bump
    )]
    pub stake: Account<'info, Stake>,
    /// CHECK: fee mint A.
    pub token_a_mint: UncheckedAccount<'info>,
    /// CHECK: fee mint B.
    pub token_b_mint: UncheckedAccount<'info>,
    #[account(mut, token::mint = vault.token_a_mint, token::token_program = token_a_program)]
    pub vault_a_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = vault.token_b_mint, token::token_program = token_b_program)]
    pub vault_b_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = vault.token_a_mint, token::token_program = token_a_program)]
    pub owner_a_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = vault.token_b_mint, token::token_program = token_b_program)]
    pub owner_b_account: InterfaceAccount<'info, TokenAccount>,
    pub token_a_program: Interface<'info, TokenInterface>,
    pub token_b_program: Interface<'info, TokenInterface>,
}

pub fn handler(ctx: Context<Harvest>) -> Result<()> {
    settle(&mut ctx.accounts.stake, &ctx.accounts.vault)?;

    let amount_a = ctx.accounts.stake.pending_a;
    let amount_b = ctx.accounts.stake.pending_b;
    require!(amount_a > 0 || amount_b > 0, PerpetuaError::NothingToHarvest);

    let position_key = ctx.accounts.vault.position;
    let bump = ctx.accounts.vault.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, position_key.as_ref(), &[bump]]];

    if amount_a > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_a_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_a_account.to_account_info(),
                    mint: ctx.accounts.token_a_mint.to_account_info(),
                    to: ctx.accounts.owner_a_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            amount_a,
            ctx.accounts.vault_a_account.decimals,
        )?;
    }
    if amount_b > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_b_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.vault_b_account.to_account_info(),
                    mint: ctx.accounts.token_b_mint.to_account_info(),
                    to: ctx.accounts.owner_b_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer_seeds,
            ),
            amount_b,
            ctx.accounts.vault_b_account.decimals,
        )?;
    }

    ctx.accounts.stake.pending_a = 0;
    ctx.accounts.stake.pending_b = 0;

    emit!(Harvested {
        vault: ctx.accounts.vault.key(),
        owner: ctx.accounts.owner.key(),
        amount_a,
        amount_b,
    });
    Ok(())
}
