use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token};

use crate::constants::{SHARE_DECIMALS, SHARE_SUPPLY, VAULT_SEED};
use crate::cpi;
use crate::errors::PerpetuaError;
use crate::events::VaultCreated;
use crate::state::{Config, Vault};

#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    pub config: Account<'info, Config>,
    /// CHECK: pool address recorded in the vault and later matched with `has_one`.
    pub pool: UncheckedAccount<'info>,
    /// CHECK: DAMM v2 position account; lock state is parsed from raw data.
    #[account(mut)]
    pub position: UncheckedAccount<'info>,
    /// CHECK: position NFT mint recorded for provenance.
    pub position_nft_mint: UncheckedAccount<'info>,
    /// CHECK: position NFT token account; its authority is handed to the vault PDA.
    #[account(mut)]
    pub position_nft_account: UncheckedAccount<'info>,
    /// CHECK: token program that owns the NFT account (spl-token or token-2022).
    pub position_nft_program: UncheckedAccount<'info>,
    /// CHECK: fee mint A of the underlying pool.
    pub token_a_mint: UncheckedAccount<'info>,
    /// CHECK: fee mint B of the underlying pool.
    pub token_b_mint: UncheckedAccount<'info>,
    /// CHECK: token program for fee mint A.
    pub token_a_program: UncheckedAccount<'info>,
    /// CHECK: token program for fee mint B.
    pub token_b_program: UncheckedAccount<'info>,
    #[account(
        init,
        payer = creator,
        space = Vault::LEN,
        seeds = [VAULT_SEED, position.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(init, payer = creator, mint::decimals = SHARE_DECIMALS, mint::authority = creator)]
    pub share_mint: Account<'info, Mint>,
    /// CHECK: recipient of the full share supply (creator ATA for the share mint).
    #[account(mut)]
    pub creator_share_account: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    /// CHECK: DAMM v2 program used for the `claim_position_fee` CPI at crank time.
    pub cp_amm_program: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_create_vault(ctx: Context<CreateVault>) -> Result<()> {
    let lock = cpi::parse_position_lock(&ctx.accounts.position.data.borrow())?;
    require!(
        lock.unlocked == 0 && lock.vested == 0,
        PerpetuaError::PositionNotFullyLocked
    );
    require!(lock.permanent_locked > 0, PerpetuaError::NoPermanentLock);

    require_keys_eq!(
        ctx.accounts.position_nft_program.key(),
        *ctx.accounts.position_nft_account.owner,
        PerpetuaError::Unauthorized
    );

    let vault_key = ctx.accounts.vault.key();
    cpi::set_account_owner(
        &ctx.accounts.position_nft_program.to_account_info(),
        &ctx.accounts.position_nft_account.to_account_info(),
        &ctx.accounts.creator.to_account_info(),
        vault_key,
    )?;

    let created_at = Clock::get()?.unix_timestamp;
    {
        let vault = &mut ctx.accounts.vault;
        vault.pool = ctx.accounts.pool.key();
        vault.position = ctx.accounts.position.key();
        vault.position_nft_mint = ctx.accounts.position_nft_mint.key();
        vault.position_nft_account = ctx.accounts.position_nft_account.key();
        vault.token_a_mint = ctx.accounts.token_a_mint.key();
        vault.token_b_mint = ctx.accounts.token_b_mint.key();
        vault.token_a_program = ctx.accounts.token_a_program.key();
        vault.token_b_program = ctx.accounts.token_b_program.key();
        vault.share_mint = ctx.accounts.share_mint.key();
        vault.total_staked = 0;
        vault.acc_fee_per_share_a = 0;
        vault.acc_fee_per_share_b = 0;
        vault.carry_a = 0;
        vault.carry_b = 0;
        vault.total_claimed_a = 0;
        vault.total_claimed_b = 0;
        vault.creator = ctx.accounts.creator.key();
        vault.created_at = created_at;
        vault.bump = ctx.bumps.vault;
    }

    mint_full_supply(&ctx)?;
    revoke_share_mint_authority(&ctx)?;

    let vault = &ctx.accounts.vault;
    emit!(VaultCreated {
        vault: vault_key,
        pool: vault.pool,
        position: vault.position,
        share_mint: vault.share_mint,
        creator: vault.creator,
    });
    Ok(())
}

fn mint_full_supply(ctx: &Context<CreateVault>) -> Result<()> {
    token::mint_to(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.creator_share_account.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        ),
        SHARE_SUPPLY,
    )
}

fn revoke_share_mint_authority(ctx: &Context<CreateVault>) -> Result<()> {
    cpi::revoke_mint_authority(
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.share_mint.to_account_info(),
        &ctx.accounts.creator.to_account_info(),
    )
}
