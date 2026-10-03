use anchor_lang::prelude::*;

use crate::constants::{BPS_DENOMINATOR, FEE_PER_SHARE_PRECISION};
use crate::errors::PerpetuaError;
use crate::state::{Stake, Vault};

/// Credits `(delta + carry)` to the accumulator. Fees that arrive while nobody is
/// staked are banked in `carry` and released to the next stakers.
pub fn accrue(vault: &mut Vault, delta_a: u64, delta_b: u64) -> Result<()> {
    vault.total_claimed_a = vault
        .total_claimed_a
        .checked_add(delta_a)
        .ok_or(PerpetuaError::MathOverflow)?;
    vault.total_claimed_b = vault
        .total_claimed_b
        .checked_add(delta_b)
        .ok_or(PerpetuaError::MathOverflow)?;

    if vault.total_staked == 0 {
        vault.carry_a = vault.carry_a.checked_add(delta_a).ok_or(PerpetuaError::MathOverflow)?;
        vault.carry_b = vault.carry_b.checked_add(delta_b).ok_or(PerpetuaError::MathOverflow)?;
        return Ok(());
    }

    let total = vault.total_staked as u128;
    let bank_a = delta_a.checked_add(vault.carry_a).ok_or(PerpetuaError::MathOverflow)? as u128;
    let bank_b = delta_b.checked_add(vault.carry_b).ok_or(PerpetuaError::MathOverflow)? as u128;

    vault.acc_fee_per_share_a = vault
        .acc_fee_per_share_a
        .checked_add(
            bank_a
                .checked_mul(FEE_PER_SHARE_PRECISION)
                .ok_or(PerpetuaError::MathOverflow)?
                .checked_div(total)
                .ok_or(PerpetuaError::MathOverflow)?,
        )
        .ok_or(PerpetuaError::MathOverflow)?;
    vault.acc_fee_per_share_b = vault
        .acc_fee_per_share_b
        .checked_add(
            bank_b
                .checked_mul(FEE_PER_SHARE_PRECISION)
                .ok_or(PerpetuaError::MathOverflow)?
                .checked_div(total)
                .ok_or(PerpetuaError::MathOverflow)?,
        )
        .ok_or(PerpetuaError::MathOverflow)?;

    vault.carry_a = 0;
    vault.carry_b = 0;
    Ok(())
}

pub fn pending_a(stake: &Stake, vault: &Vault) -> Result<u64> {
    pending(stake.amount, vault.acc_fee_per_share_a, stake.debt_a)
}

pub fn pending_b(stake: &Stake, vault: &Vault) -> Result<u64> {
    pending(stake.amount, vault.acc_fee_per_share_b, stake.debt_b)
}

fn pending(amount: u64, acc: u128, debt: u128) -> Result<u64> {
    if acc <= debt || amount == 0 {
        return Ok(0);
    }
    let accrued = (amount as u128)
        .checked_mul(acc.checked_sub(debt).ok_or(PerpetuaError::MathOverflow)?)
        .ok_or(PerpetuaError::MathOverflow)?
        .checked_div(FEE_PER_SHARE_PRECISION)
        .ok_or(PerpetuaError::MathOverflow)?;
    u64::try_from(accrued).map_err(|_| PerpetuaError::MathOverflow.into())
}

/// Applies the optional protocol skim to a freshly claimed amount.
pub fn apply_protocol_fee(amount: u64, protocol_fee_bps: u16) -> Result<(u64, u64)> {
    if protocol_fee_bps == 0 || amount == 0 {
        return Ok((amount, 0));
    }
    let fee = (amount as u128)
        .checked_mul(protocol_fee_bps as u128)
        .ok_or(PerpetuaError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(PerpetuaError::MathOverflow)?;
    let fee = u64::try_from(fee).map_err(|_| PerpetuaError::MathOverflow)?;
    Ok((amount.checked_sub(fee).ok_or(PerpetuaError::MathOverflow)?, fee))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(total_staked: u64) -> Vault {
        Vault {
            pool: Pubkey::default(),
            position: Pubkey::default(),
            position_nft_mint: Pubkey::default(),
            position_nft_account: Pubkey::default(),
            token_a_mint: Pubkey::default(),
            token_b_mint: Pubkey::default(),
            token_a_program: Pubkey::default(),
            token_b_program: Pubkey::default(),
            share_mint: Pubkey::default(),
            total_staked,
            acc_fee_per_share_a: 0,
            acc_fee_per_share_b: 0,
            carry_a: 0,
            carry_b: 0,
            total_claimed_a: 0,
            total_claimed_b: 0,
            creator: Pubkey::default(),
            created_at: 0,
            bump: 0,
        }
    }

    fn stake(amount: u64) -> Stake {
        Stake {
            vault: Pubkey::default(),
            owner: Pubkey::default(),
            amount,
            debt_a: 0,
            debt_b: 0,
            pending_a: 0,
            pending_b: 0,
            bump: 0,
        }
    }

    #[test]
    fn splits_fees_pro_rata() {
        let mut vault = vault(100);
        accrue(&mut vault, 100, 0).unwrap();
        assert_eq!(pending_a(&stake(25), &vault).unwrap(), 25);
        assert_eq!(pending_a(&stake(100), &vault).unwrap(), 100);
        assert_eq!(vault.total_claimed_a, 100);
    }

    #[test]
    fn banks_carry_when_nobody_is_staked() {
        let mut vault = vault(0);
        accrue(&mut vault, 100, 5).unwrap();
        assert_eq!(vault.carry_a, 100);
        assert_eq!(vault.carry_b, 5);
        assert_eq!(vault.acc_fee_per_share_a, 0);
        assert_eq!(vault.total_claimed_a, 100);
    }

    #[test]
    fn releases_carry_to_the_first_staker() {
        let mut vault = vault(0);
        accrue(&mut vault, 100, 0).unwrap();
        vault.total_staked = 10;
        accrue(&mut vault, 0, 0).unwrap();
        assert_eq!(pending_a(&stake(10), &vault).unwrap(), 100);
        assert_eq!(vault.carry_a, 0);
    }

    #[test]
    fn never_pays_out_more_than_was_claimed() {
        let mut vault = vault(3);
        accrue(&mut vault, 10, 0).unwrap();
        let paid: u64 = (0..3).map(|_| pending_a(&stake(1), &vault).unwrap()).sum();
        assert!(paid <= 10);
        assert!(paid >= 9);
    }

    #[test]
    fn zero_fee_claim_is_a_no_op() {
        let mut vault = vault(50);
        accrue(&mut vault, 0, 0).unwrap();
        assert_eq!(vault.acc_fee_per_share_a, 0);
        assert_eq!(pending_a(&stake(50), &vault).unwrap(), 0);
    }

    #[test]
    fn protocol_fee_is_bounded_and_exact() {
        assert_eq!(apply_protocol_fee(1_000, 0).unwrap(), (1_000, 0));
        assert_eq!(apply_protocol_fee(1_000, 100).unwrap(), (990, 10));
        assert_eq!(apply_protocol_fee(0, 500).unwrap(), (0, 0));
    }
}
