use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, TokenAccount, TransferChecked};

use crate::constants::VAULT_SEED;
use crate::cpi;
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

pub struct ClaimAccounts<'info> {
    pub pool: AccountInfo<'info>,
    pub position: AccountInfo<'info>,
    pub position_nft_account: AccountInfo<'info>,
    pub token_a_mint: AccountInfo<'info>,
    pub token_b_mint: AccountInfo<'info>,
    pub vault_a_account: InterfaceAccount<'info, TokenAccount>,
    pub vault_b_account: InterfaceAccount<'info, TokenAccount>,
    pub treasury_a_account: InterfaceAccount<'info, TokenAccount>,
    pub treasury_b_account: InterfaceAccount<'info, TokenAccount>,
    pub token_a_program: AccountInfo<'info>,
    pub token_b_program: AccountInfo<'info>,
    pub cp_amm_program: AccountInfo<'info>,
}

impl<'info> ClaimAccounts<'info> {
    fn token_a_mint_info(&self) -> AccountInfo<'info> {
        self.token_a_mint.clone()
    }

    fn token_b_mint_info(&self) -> AccountInfo<'info> {
        self.token_b_mint.clone()
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

    let cpi_accounts = vec![
        accounts.pool.clone(),
        accounts.position.clone(),
        accounts.position_nft_account.clone(),
        accounts.token_a_mint_info(),
        accounts.token_b_mint_info(),
        accounts.vault_a_account.to_account_info(),
        accounts.vault_b_account.to_account_info(),
        accounts.token_a_program.clone(),
        accounts.token_b_program.clone(),
        vault.to_account_info(),
    ];

    cpi::claim_position_fee(&accounts.cp_amm_program, &cpi_accounts, signer_seeds)?;

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
            accounts.vault_a_account.decimals,
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
            accounts.vault_b_account.decimals,
        )?;
        accounts.vault_b_account.reload()?;
    }
    Ok(())
}
