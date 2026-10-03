use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use anchor_spl::token_interface::{TokenAccount as TokenAccount2022, TokenInterface};

use crate::constants::{STAKE_SEED, VAULT_SEED};
use crate::errors::PerpetuaError;
use crate::events::Unstaked;
use crate::instructions::touch::{settle, touch, ClaimAccounts};
use crate::state::{Config, Stake, Vault};

#[derive(Accounts)]
pub struct UnstakeContext<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub config: Account<'info, Config>,
    #[account(mut, has_one = pool)]
    pub vault: Account<'info, Vault>,
    /// CHECK: pinned to `Vault::pool` by the `has_one` constraint.
    #[account(mut)]
    pub pool: UncheckedAccount<'info>,
    /// CHECK: DAMM v2 position account.
    #[account(mut)]
    pub position: UncheckedAccount<'info>,
    /// CHECK: position NFT account owned by the vault PDA.
    #[account(mut)]
    pub position_nft_account: UncheckedAccount<'info>,
    /// CHECK: fee mint A.
    pub token_a_mint: UncheckedAccount<'info>,
    /// CHECK: fee mint B.
    pub token_b_mint: UncheckedAccount<'info>,
    #[account(mut, token::mint = vault.token_a_mint, token::token_program = token_a_program)]
    pub vault_a_account: InterfaceAccount<'info, TokenAccount2022>,
    #[account(mut, token::mint = vault.token_b_mint, token::token_program = token_b_program)]
    pub vault_b_account: InterfaceAccount<'info, TokenAccount2022>,
    /// CHECK: protocol treasury.
    pub treasury: UncheckedAccount<'info>,
    #[account(mut)]
    pub treasury_a_account: InterfaceAccount<'info, TokenAccount2022>,
    #[account(mut)]
    pub treasury_b_account: InterfaceAccount<'info, TokenAccount2022>,
    pub token_a_program: Interface<'info, TokenInterface>,
    pub token_b_program: Interface<'info, TokenInterface>,
    /// CHECK: DAMM v2 program.
    pub cp_amm_program: UncheckedAccount<'info>,
    #[account(
        mut,
        has_one = vault,
        has_one = owner,
        seeds = [STAKE_SEED, vault.key().as_ref(), owner.key().as_ref()],
        bump = stake.bump
    )]
    pub stake: Account<'info, Stake>,
    #[account(address = vault.share_mint)]
    pub share_mint: Account<'info, Mint>,
    #[account(mut, token::mint = share_mint, token::authority = owner)]
    pub owner_share_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = share_mint, token::authority = vault)]
    pub vault_share_account: Account<'info, TokenAccount>,
    pub share_token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UnstakeNoClaim<'info> {
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
    #[account(address = vault.share_mint)]
    pub share_mint: Account<'info, Mint>,
    #[account(mut, token::mint = share_mint, token::authority = owner)]
    pub owner_share_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = share_mint, token::authority = vault)]
    pub vault_share_account: Account<'info, TokenAccount>,
    pub share_token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<UnstakeContext>, amount: u64) -> Result<()> {
    {
        let mut accounts = ClaimAccounts {
            pool: ctx.accounts.pool.to_account_info(),
            position: ctx.accounts.position.to_account_info(),
            position_nft_account: ctx.accounts.position_nft_account.to_account_info(),
            token_a_mint: ctx.accounts.token_a_mint.to_account_info(),
            token_b_mint: ctx.accounts.token_b_mint.to_account_info(),
            vault_a_account: ctx.accounts.vault_a_account.clone(),
            vault_b_account: ctx.accounts.vault_b_account.clone(),
            treasury_a_account: ctx.accounts.treasury_a_account.clone(),
            treasury_b_account: ctx.accounts.treasury_b_account.clone(),
            token_a_program: ctx.accounts.token_a_program.to_account_info(),
            token_b_program: ctx.accounts.token_b_program.to_account_info(),
            cp_amm_program: ctx.accounts.cp_amm_program.to_account_info(),
        };
        touch(&ctx.accounts.config, &mut ctx.accounts.vault, &mut accounts)?;
    }

    settle(&mut ctx.accounts.stake, &ctx.accounts.vault)?;
    release_shares(
        &mut ctx.accounts.stake,
        &mut ctx.accounts.vault,
        &ctx.accounts.vault_share_account,
        &ctx.accounts.owner_share_account,
        &ctx.accounts.share_token_program,
        &ctx.accounts.owner,
        amount,
    )
}

pub fn handler_no_claim(ctx: Context<UnstakeNoClaim>, amount: u64) -> Result<()> {
    settle(&mut ctx.accounts.stake, &ctx.accounts.vault)?;
    release_shares(
        &mut ctx.accounts.stake,
        &mut ctx.accounts.vault,
        &ctx.accounts.vault_share_account,
        &ctx.accounts.owner_share_account,
        &ctx.accounts.share_token_program,
        &ctx.accounts.owner,
        amount,
    )
}

fn release_shares<'info>(
    stake: &mut Account<'info, Stake>,
    vault: &mut Account<'info, Vault>,
    vault_share_account: &Account<'info, TokenAccount>,
    owner_share_account: &Account<'info, TokenAccount>,
    share_token_program: &Program<'info, Token>,
    owner: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0 && amount <= stake.amount, PerpetuaError::InsufficientShares);

    let position_key = vault.position;
    let bump = vault.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, position_key.as_ref(), &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            share_token_program.to_account_info(),
            Transfer {
                from: vault_share_account.to_account_info(),
                to: owner_share_account.to_account_info(),
                authority: vault.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    stake.amount = stake.amount.checked_sub(amount).ok_or(PerpetuaError::MathOverflow)?;
    vault.total_staked = vault
        .total_staked
        .checked_sub(amount)
        .ok_or(PerpetuaError::MathOverflow)?;

    emit!(Unstaked {
        vault: vault.key(),
        owner: owner.key(),
        amount,
    });
    Ok(())
}

