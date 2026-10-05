use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;

use crate::constants::{
    AUTHORITY_ACCOUNT_OWNER, AUTHORITY_MINT_TOKENS, CP_AMM_CLAIM_POSITION_FEE_DISCRIMINATOR,
    POSITION_MIN_LEN, POSITION_PERMANENT_LOCK_OFFSET, POSITION_UNLOCKED_OFFSET,
    POSITION_VESTED_OFFSET, TOKEN_SET_AUTHORITY,
};
use crate::errors::PerpetuaError;

/// `SetAuthority` payload.
///
/// The `COption<Pubkey>` here is the **instruction-data** form, which SPL Token packs with a
/// one-byte tag (`Pack::LEN == 1 + 32`). The four-byte tag belongs to the *account-state* form used
/// inside token accounts, and using it here is silently catastrophic: the token program reads the
/// tag, then takes the next 32 bytes as the new authority, so a `Some` payload shifted by three
/// bytes hands ownership to `0x000000 || authority[0..29]` — an address nobody can ever sign for.
fn set_authority_data(authority_type: u8, new_authority: Option<Pubkey>) -> Vec<u8> {
    let mut data = Vec::with_capacity(3 + 32);
    data.push(TOKEN_SET_AUTHORITY);
    data.push(authority_type);
    match new_authority {
        Some(authority) => {
            data.push(1);
            data.extend_from_slice(authority.as_ref());
        }
        None => data.push(0),
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

pub struct PositionLock {
    pub unlocked: u128,
    pub vested: u128,
    pub permanent_locked: u128,
}

/// The fifteen accounts DAMM v2 `claim_position_fee` expects, in IDL order.
pub struct ClaimCpiAccounts<'info> {
    pub pool_authority: AccountInfo<'info>,
    pub pool: AccountInfo<'info>,
    pub position: AccountInfo<'info>,
    pub token_a_account: AccountInfo<'info>,
    pub token_b_account: AccountInfo<'info>,
    pub token_a_vault: AccountInfo<'info>,
    pub token_b_vault: AccountInfo<'info>,
    pub token_a_mint: AccountInfo<'info>,
    pub token_b_mint: AccountInfo<'info>,
    pub position_nft_account: AccountInfo<'info>,
    pub signer: AccountInfo<'info>,
    pub token_a_program: AccountInfo<'info>,
    pub token_b_program: AccountInfo<'info>,
    pub event_authority: AccountInfo<'info>,
    pub program: AccountInfo<'info>,
}

impl<'info> ClaimCpiAccounts<'info> {
    fn metas(&self) -> Vec<AccountMeta> {
        vec![
            AccountMeta::new_readonly(*self.pool_authority.key, false),
            AccountMeta::new_readonly(*self.pool.key, false),
            AccountMeta::new(*self.position.key, false),
            AccountMeta::new(*self.token_a_account.key, false),
            AccountMeta::new(*self.token_b_account.key, false),
            AccountMeta::new(*self.token_a_vault.key, false),
            AccountMeta::new(*self.token_b_vault.key, false),
            AccountMeta::new_readonly(*self.token_a_mint.key, false),
            AccountMeta::new_readonly(*self.token_b_mint.key, false),
            AccountMeta::new_readonly(*self.position_nft_account.key, false),
            AccountMeta::new_readonly(*self.signer.key, true),
            AccountMeta::new_readonly(*self.token_a_program.key, false),
            AccountMeta::new_readonly(*self.token_b_program.key, false),
            AccountMeta::new_readonly(*self.event_authority.key, false),
            AccountMeta::new_readonly(*self.program.key, false),
        ]
    }

    fn infos(&self) -> Vec<AccountInfo<'info>> {
        vec![
            self.pool_authority.clone(),
            self.pool.clone(),
            self.position.clone(),
            self.token_a_account.clone(),
            self.token_b_account.clone(),
            self.token_a_vault.clone(),
            self.token_b_vault.clone(),
            self.token_a_mint.clone(),
            self.token_b_mint.clone(),
            self.position_nft_account.clone(),
            self.signer.clone(),
            self.token_a_program.clone(),
            self.token_b_program.clone(),
            self.event_authority.clone(),
            self.program.clone(),
        ]
    }
}

/// CPIs into DAMM v2 `claim_position_fee`, signed by the vault PDA.
pub fn claim_position_fee<'info>(
    accounts: ClaimCpiAccounts<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let instruction = Instruction {
        program_id: *accounts.program.key,
        accounts: accounts.metas(),
        data: CP_AMM_CLAIM_POSITION_FEE_DISCRIMINATOR.to_vec(),
    };
    invoke_signed(&instruction, &accounts.infos(), signer_seeds)?;
    Ok(())
}

pub fn parse_position_lock(data: &[u8]) -> Result<PositionLock> {
    require!(data.len() >= POSITION_MIN_LEN, PerpetuaError::PositionNotFullyLocked);
    let unlocked = read_u128(data, POSITION_UNLOCKED_OFFSET)?;
    let vested = read_u128(data, POSITION_VESTED_OFFSET)?;
    let permanent_locked = read_u128(data, POSITION_PERMANENT_LOCK_OFFSET)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    /// The wire format is unforgiving: a four-byte tag shifts the authority by three bytes and the
    /// position NFT is lost forever. Pin the exact bytes.
    #[test]
    fn set_authority_some_uses_a_one_byte_tag() {
        let authority = pubkey!("G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2");
        let data = set_authority_data(AUTHORITY_ACCOUNT_OWNER, Some(authority));

        assert_eq!(data.len(), 35);
        assert_eq!(data[0], TOKEN_SET_AUTHORITY);
        assert_eq!(data[1], AUTHORITY_ACCOUNT_OWNER);
        assert_eq!(data[2], 1, "COption tag must be a single byte");
        assert_eq!(&data[3..], authority.as_ref());
    }

    #[test]
    fn set_authority_none_is_a_one_byte_tag() {
        let data = set_authority_data(AUTHORITY_MINT_TOKENS, None);
        assert_eq!(data.len(), 3);
        assert_eq!(data[0], TOKEN_SET_AUTHORITY);
        assert_eq!(data[1], AUTHORITY_MINT_TOKENS);
        assert_eq!(data[2], 0);
    }

    #[test]
    fn position_lock_reads_the_documented_offsets() {
        let mut data = vec![0u8; POSITION_MIN_LEN];
        data[POSITION_UNLOCKED_OFFSET..POSITION_UNLOCKED_OFFSET + 16]
            .copy_from_slice(&7u128.to_le_bytes());
        data[POSITION_VESTED_OFFSET..POSITION_VESTED_OFFSET + 16]
            .copy_from_slice(&9u128.to_le_bytes());
        data[POSITION_PERMANENT_LOCK_OFFSET..POSITION_PERMANENT_LOCK_OFFSET + 16]
            .copy_from_slice(&11u128.to_le_bytes());

        let lock = parse_position_lock(&data).expect("parses");
        assert_eq!((lock.unlocked, lock.vested, lock.permanent_locked), (7, 9, 11));
    }

    #[test]
    fn a_short_position_is_rejected() {
        assert!(parse_position_lock(&[0u8; 10]).is_err());
    }
}
