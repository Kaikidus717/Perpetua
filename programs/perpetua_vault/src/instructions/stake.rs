use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use anchor_spl::token_interface::{TokenAccount as TokenAccount2022, TokenInterface};

use crate::constants::STAKE_SEED;
use crate::errors::PerpetuaError;
use crate::events::Staked;
use crate::instructions::touch::{settle, touch, ClaimAccounts};
use crate::state::{Config, Stake, Vault};

#[derive(Accounts)]
pub struct StakeContext<'info> {
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
        init_if_needed,
        payer = owner,
        space = Stake::LEN,
        seeds = [STAKE_SEED, vault.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub stake: Account<'info, Stake>,
    #[account(address = vault.share_mint)]
    pub share_mint: Account<'info, Mint>,
    #[account(mut, token::mint = share_mint, token::authority = owner)]
    pub owner_share_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = share_mint, token::authority = vault)]
    pub vault_share_account: Account<'info, TokenAccount>,
    pub share_token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<StakeContext>, amount: u64) -> Result<()> {
    require!(amount > 0, PerpetuaError::InsufficientShares);

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

    token::transfer(
        CpiContext::new(
            ctx.accounts.share_token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_share_account.to_account_info(),
                to: ctx.accounts.vault_share_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    let stake = &mut ctx.accounts.stake;
    stake.vault = ctx.accounts.vault.key();
    stake.owner = ctx.accounts.owner.key();
    stake.bump = ctx.bumps.stake;
    stake.amount = stake.amount.checked_add(amount).ok_or(PerpetuaError::MathOverflow)?;

    let vault = &mut ctx.accounts.vault;
    vault.total_staked = vault
        .total_staked
        .checked_add(amount)
        .ok_or(PerpetuaError::MathOverflow)?;

    emit!(Staked {
        vault: ctx.accounts.vault.key(),
        owner: ctx.accounts.owner.key(),
        amount,
    });
    Ok(())
}
