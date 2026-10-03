use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

use crate::constants::{
    AUTHORITY_ACCOUNT_OWNER, AUTHORITY_MINT_TOKENS, CP_AMM_CLAIM_POSITION_FEE_DISCRIMINATOR,
    TOKEN_SET_AUTHORITY,
};
use crate::errors::PerpetuaError;

fn set_authority_data(authority_type: u8, new_authority: Option<Pubkey>) -> Vec<u8> {
    let mut data = Vec::with_capacity(38);
    data.push(TOKEN_SET_AUTHORITY);
    data.push(authority_type);
    match new_authority {
        Some(authority) => {
            data.extend_from_slice(&1u32.to_le_bytes());
            data.extend_from_slice(authority.as_ref());
        }
        None => data.extend_from_slice(&0u32.to_le_bytes()),
    }
    data
}

/// SPL Token / Token-2022 `SetAuthority(AccountOwner)`.
pub fn set_account_owner<'info>(
    token_program: &AccountInfo<'info>,
    account: &AccountInfo<'info>,
    current_authority: &AccountInfo<'info>,
    new_authority: Pubkey,
) -> Result<()> {
    let instruction = Instruction {
        program_id: *token_program.key,
        accounts: vec![
            AccountMeta::new(*account.key, false),
            AccountMeta::new_readonly(*current_authority.key, true),
        ],
        data: set_authority_data(AUTHORITY_ACCOUNT_OWNER, Some(new_authority)),
    };
    invoke_signed(&instruction, &[account.clone(), current_authority.clone()], &[])?;
    Ok(())
}

/// SPL Token `SetAuthority(MintTokens -> None)`.
pub fn revoke_mint_authority<'info>(
    token_program: &AccountInfo<'info>,
    mint: &AccountInfo<'info>,
    current_authority: &AccountInfo<'info>,
) -> Result<()> {
    let instruction = Instruction {
        program_id: *token_program.key,
        accounts: vec![
            AccountMeta::new(*mint.key, false),
            AccountMeta::new_readonly(*current_authority.key, true),
        ],
        data: set_authority_data(AUTHORITY_MINT_TOKENS, None),
    };
    invoke_signed(&instruction, &[mint.clone(), current_authority.clone()], &[])?;
    Ok(())
}

/// CPI into DAMM v2 `claim_position_fee`, signed by the vault PDA.
///
/// Account order must be confirmed against the deployed cp-amm IDL before mainnet
/// use; it is listed in docs/INTEGRATIONS.md.
pub fn claim_position_fee<'info>(
    cp_amm_program: &AccountInfo<'info>,
    accounts: &[AccountInfo<'info>],
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let instruction = Instruction {
        program_id: *cp_amm_program.key,
        accounts: accounts
            .iter()
            .map(|account| {
                if account.is_writable {
                    AccountMeta::new(*account.key, account.is_signer)
                } else {
                    AccountMeta::new_readonly(*account.key, account.is_signer)
                }
            })
            .collect(),
        data: CP_AMM_CLAIM_POSITION_FEE_DISCRIMINATOR.to_vec(),
    };
    let mut infos = Vec::with_capacity(accounts.len() + 1);
    infos.push(cp_amm_program.clone());
    infos.extend_from_slice(accounts);
    invoke_signed(&instruction, &infos, signer_seeds)?;
    Ok(())
}

pub struct PositionLock {
    pub unlocked: u128,
    pub vested: u128,
    pub permanent_locked: u128,
}

// Byte offsets into the DAMM v2 position account. Confirm against the DAMM v2 IDL
// before deploying; see docs/INTEGRATIONS.md ("verify list").
const POSITION_LOCK_OFFSET: usize = 8 + 32 + 32 + 32 + 1 + 1;
const POSITION_MIN_LEN: usize = POSITION_LOCK_OFFSET + 16 * 3;

pub fn parse_position_lock(data: &[u8]) -> Result<PositionLock> {
    require!(data.len() >= POSITION_MIN_LEN, PerpetuaError::PositionNotFullyLocked);
    let unlocked = read_u128(data, POSITION_LOCK_OFFSET)?;
    let vested = read_u128(data, POSITION_LOCK_OFFSET + 16)?;
    let permanent_locked = read_u128(data, POSITION_LOCK_OFFSET + 32)?;
    Ok(PositionLock { unlocked, vested, permanent_locked })
}

fn read_u128(data: &[u8], offset: usize) -> Result<u128> {
    let slice = data
        .get(offset..offset + 16)
        .ok_or(PerpetuaError::PositionNotFullyLocked)?;
    let mut buffer = [0u8; 16];
    buffer.copy_from_slice(slice);
    Ok(u128::from_le_bytes(buffer))
}
