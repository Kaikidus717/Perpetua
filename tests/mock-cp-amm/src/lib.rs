//! A mock DAMM v2, loaded **at the real cp-amm address**, so the vault's `claim_position_fee` CPI
//! has something to call inside LiteSVM.
//!
//! It is deliberately tiny: it implements exactly one observable behaviour of `claim_position_fee`
//! — the one the vault actually depends on — namely "the fee delta lands in the destination token
//! accounts". The vault measures the payout as a balance diff around the CPI, so the mock mints the
//! payout into those accounts using its own PDA as mint authority.
//!
//! Two things are therefore *not* covered by this mock, and a fork test with the real binary is
//! what would cover them: DAMM v2's own validation of the pool/position, and its fee arithmetic.
//!
//! Payout amounts are read from the position fixture at offsets 200 and 208, which the real
//! `Position` never occupies (it is 200 bytes of lock state) — a test-only channel so a test can
//! steer the payout, including zero.
//!
//! `scripts/fetch-programs.sh` dumps the real `cp_amm.so`; pointing the harness at it instead is a
//! one-line change in `tests/litesvm/src/lib.rs`.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    program::invoke,
    program_error::ProgramError,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

/// `global:claim_position_fee`, from the shipped cp-amm IDL.
const CLAIM_POSITION_FEE: [u8; 8] = [180, 38, 154, 17, 133, 33, 162, 211];

/// Offsets of the two test-only payout slots inside the position fixture.
const FEE_A_OFFSET: usize = 200;
const FEE_B_OFFSET: usize = 208;

/// SPL Token `Transfer`.
const TOKEN_TRANSFER: u8 = 3;

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() < 8 || data[..8] != CLAIM_POSITION_FEE {
        return Err(ProgramError::InvalidInstructionData);
    }

    let mut iter = accounts.iter();
    let _pool_authority = next_account_info(&mut iter)?;
    let _pool = next_account_info(&mut iter)?;
    let position = next_account_info(&mut iter)?;
    let token_a_account = next_account_info(&mut iter)?;
    let token_b_account = next_account_info(&mut iter)?;
    let token_a_vault = next_account_info(&mut iter)?;
    let token_b_vault = next_account_info(&mut iter)?;
    let token_a_mint = next_account_info(&mut iter)?;
    let token_b_mint = next_account_info(&mut iter)?;
    let _position_nft_account = next_account_info(&mut iter)?;
    // The vault PDA. Its signer privilege was granted by the vault's own `invoke_signed`, and it
    // propagates into this CPI, so the mock can mint the payout under it without holding any seed.
    let signer = next_account_info(&mut iter)?;
    let token_a_program = next_account_info(&mut iter)?;
    let token_b_program = next_account_info(&mut iter)?;
    let _event_authority = next_account_info(&mut iter)?;

    let (fee_a, fee_b) = {
        let position_data = position.try_borrow_data()?;
        if position_data.len() < FEE_B_OFFSET + 8 {
            return Err(ProgramError::AccountDataTooSmall);
        }
        (
            u64::from_le_bytes(position_data[FEE_A_OFFSET..FEE_A_OFFSET + 8].try_into().unwrap()),
            u64::from_le_bytes(position_data[FEE_B_OFFSET..FEE_B_OFFSET + 8].try_into().unwrap()),
        )
    };

    let _ = (program_id, token_a_mint, token_b_mint);

    // A fee claim moves the pool's fees into the vault's token accounts; it does not mint. Keeping
    // the mock to a transfer means the mints stay read-only, exactly as the vault declares them.
    if fee_a > 0 {
        transfer(token_a_program, token_a_vault, token_a_account, signer, fee_a)?;
    }
    if fee_b > 0 {
        transfer(token_b_program, token_b_vault, token_b_account, signer, fee_b)?;
    }

    Ok(())
}

/// `invoke`, not `invoke_signed`: `authority` is already a signer in this instruction's context,
/// and the runtime lets a caller pass that privilege one level further down.
fn transfer<'a>(
    token_program: &AccountInfo<'a>,
    source: &AccountInfo<'a>,
    destination: &AccountInfo<'a>,
    authority: &AccountInfo<'a>,
    amount: u64,
) -> ProgramResult {
    let mut data = Vec::with_capacity(9);
    data.push(TOKEN_TRANSFER);
    data.extend_from_slice(&amount.to_le_bytes());

    let instruction = Instruction {
        program_id: *token_program.key,
        accounts: vec![
            AccountMeta::new(*source.key, false),
            AccountMeta::new(*destination.key, false),
            AccountMeta::new_readonly(*authority.key, true),
        ],
        data,
    };

    invoke(
        &instruction,
        &[source.clone(), destination.clone(), authority.clone()],
    )
}
