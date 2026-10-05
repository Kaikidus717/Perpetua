use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TransferChecked};

use crate::constants::VAULT_SEED;
use crate::cpi::{self, ClaimCpiAccounts};
use crate::errors::PerpetuaError;
use crate::math;
use crate::state::{Config, Stake, Vault};

pub struct ClaimDelta {
    pub net_a: u64,
    pub net_b: u64,
}

/// Moves the caller's outstanding fees into `pending` and snapshots the
/// accumulator, so it is safe to mutate `stake.amount` afterwards.
pub fn settle<'info>(stake: &mut Account<'info, Stake>, vault: &Account<'info, Vault>) -> Result<()> {
    let earned_a = math::pending_a(stake, vault)?;
    let earned_b = math::pending_b(stake, vault)?;
    stake.pending_a = stake
        .pending_a
        .checked_add(earned_a)
        .ok_or(PerpetuaError::MathOverflow)?;
    stake.pending_b = stake
        .pending_b
        .checked_add(earned_b)
        .ok_or(PerpetuaError::MathOverflow)?;
    stake.debt_a = vault.acc_fee_per_share_a;
    stake.debt_b = vault.acc_fee_per_share_b;
    Ok(())
}

/// The token accounts are boxed: the SBF runtime caps a stack frame at 4096 bytes, and six
/// deserialized token/mint structs on the stack blow that budget on their own.
pub struct ClaimAccounts<'info> {
    pub pool_authority: AccountInfo<'info>,
    pub pool: AccountInfo<'info>,
    pub position: AccountInfo<'info>,
    pub position_nft_account: AccountInfo<'info>,
    pub token_a_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_b_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_a_vault: AccountInfo<'info>,
    pub token_b_vault: AccountInfo<'info>,
    pub event_authority: AccountInfo<'info>,
    pub vault_a_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub vault_b_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub treasury_a_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub treasury_b_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_a_program: AccountInfo<'info>,
    pub token_b_program: AccountInfo<'info>,
    pub cp_amm_program: AccountInfo<'info>,
}

impl<'info> ClaimAccounts<'info> {
    fn token_a_mint_info(&self) -> AccountInfo<'info> {
        self.token_a_mint.to_account_info()
    }

    fn token_b_mint_info(&self) -> AccountInfo<'info> {
        self.token_b_mint.to_account_info()
    }
}

/// Claims fees by balance diff, applies the protocol skim and credits the
/// fee-per-share accumulator. Fees that arrive while nobody is staked are banked
/// as carry and released to the next stakers.
pub fn touch<'info>(
    config: &Config,
    vault: &mut Account<'info, Vault>,
    accounts: &mut ClaimAccounts<'info>,
) -> Result<ClaimDelta> {
    let before_a = accounts.vault_a_account.amount;
    let before_b = accounts.vault_b_account.amount;

    let position_key = vault.position;
    let bump = vault.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[VAULT_SEED, position_key.as_ref(), &[bump]]];

    let cpi_accounts = ClaimCpiAccounts {
        pool_authority: accounts.pool_authority.clone(),
        pool: accounts.pool.clone(),
        position: accounts.position.clone(),
        token_a_account: accounts.vault_a_account.to_account_info(),
        token_b_account: accounts.vault_b_account.to_account_info(),
        token_a_vault: accounts.token_a_vault.clone(),
        token_b_vault: accounts.token_b_vault.clone(),
        token_a_mint: accounts.token_a_mint_info(),
        token_b_mint: accounts.token_b_mint_info(),
        position_nft_account: accounts.position_nft_account.clone(),
        signer: vault.to_account_info(),
        token_a_program: accounts.token_a_program.clone(),
        token_b_program: accounts.token_b_program.clone(),
        event_authority: accounts.event_authority.clone(),
        program: accounts.cp_amm_program.clone(),
    };

    cpi::claim_position_fee(cpi_accounts, signer_seeds)?;

    accounts.vault_a_account.reload()?;
    accounts.vault_b_account.reload()?;

    let delta_a = accounts.vault_a_account.amount.saturating_sub(before_a);
    let delta_b = accounts.vault_b_account.amount.saturating_sub(before_b);

    let (net_a, fee_a) = math::apply_protocol_fee(delta_a, config.protocol_fee_bps)?;
    let (net_b, fee_b) = math::apply_protocol_fee(delta_b, config.protocol_fee_bps)?;

    skim(vault, accounts, fee_a, fee_b)?;
    math::accrue(vault, net_a, net_b)?;

    Ok(ClaimDelta { net_a, net_b })
}

fn skim<'info>(
    vault: &Account<'info, Vault>,
    accounts: &mut ClaimAccounts<'info>,
    fee_a: u64,
    fee_b: u64,
) -> Result<()> {
    if fee_a > 0 {
        token_interface::transfer_checked(
            CpiContext::new(
                accounts.token_a_program.clone(),
                TransferChecked {
                    from: accounts.vault_a_account.to_account_info(),
                    mint: accounts.token_a_mint_info(),
                    to: accounts.treasury_a_account.to_account_info(),
                    authority: vault.to_account_info(),
                },
            ),
            fee_a,
            accounts.token_a_mint.decimals,
        )?;
        accounts.vault_a_account.reload()?;
    }
    if fee_b > 0 {
        token_interface::transfer_checked(
            CpiContext::new(
                accounts.token_b_program.clone(),
                TransferChecked {
                    from: accounts.vault_b_account.to_account_info(),
                    mint: accounts.token_b_mint_info(),
                    to: accounts.treasury_b_account.to_account_info(),
                    authority: vault.to_account_info(),
                },
            ),
            fee_b,
            accounts.token_b_mint.decimals,
        )?;
        accounts.vault_b_account.reload()?;
    }
    Ok(())
}
