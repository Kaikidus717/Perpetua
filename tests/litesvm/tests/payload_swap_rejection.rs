//! Adversarial case: a multisig approves a `create_vault` payload, the payload is altered before it
//! reaches the chain, and the program refuses it.
//!
//! This is the failure that costs DAOs money in the wild — not a broken contract, but a transaction read
//! one way and executed another. Perpetua's defence is that the program validates its own accounts and
//! its own instruction data on chain, so an altered payload cannot land.
//!
//! `cargo test -p perpetua_vault_litesvm --test payload_swap_rejection`

use litesvm::LiteSVM;
use perpetua_vault_litesvm::{
    addr, instruction_data, new_svm, send, vault_pda, vault_program_id, writable, CP_AMM_PROGRAM,
};
use solana_address::Address;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_signer::Signer;

/// An address the attacker controls. The point of a swap is that it is *not* the vault.
fn attacker() -> Address {
    addr("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM")
}

fn funded_svm(payer: &Keypair) -> LiteSVM {
    let mut svm = new_svm();
    svm.airdrop(&payer.pubkey(), 10_000_000_000).expect("fund payer");
    svm
}

fn dispatch(
    svm: &mut LiteSVM,
    payer: &Keypair,
    instruction: Instruction,
    extra: &[&Keypair],
) -> Result<(), String> {
    let mut signers: Vec<&Keypair> = vec![payer];
    signers.extend_from_slice(extra);
    send(svm, payer, &[instruction], &signers)
}

#[test]
fn a_mutated_payload_is_rejected() {
    let payer = Keypair::new();
    let mut svm = funded_svm(&payer);
    let owner = Keypair::new();
    let (vault, _) = vault_pda(attacker());

    // A legitimate `create_vault` payload with one byte flipped: the discriminator no longer names an
    // instruction, which is exactly what a payload swap produces.
    let mut data = instruction_data("create_vault", &[]);
    data[0] ^= 0xff;

    let instruction = Instruction {
        program_id: vault_program_id(),
        accounts: vec![writable(vault, false), writable(owner.pubkey(), true)],
        data,
    };

    assert!(
        dispatch(&mut svm, &payer, instruction, &[&owner]).is_err(),
        "security failure: the program accepted a mutated payload"
    );
}

#[test]
fn a_substituted_vault_account_is_rejected() {
    let payer = Keypair::new();
    let mut svm = funded_svm(&payer);
    let owner = Keypair::new();

    // Same data, but the vault account is an address the attacker chose instead of the PDA derived from
    // the position. Anchor's seeds constraint is what catches this.
    let instruction = Instruction {
        program_id: vault_program_id(),
        accounts: vec![
            writable(attacker(), false),
            writable(owner.pubkey(), true),
            writable(addr(CP_AMM_PROGRAM), false),
        ],
        data: instruction_data("create_vault", &[]),
    };

    assert!(
        dispatch(&mut svm, &payer, instruction, &[&owner]).is_err(),
        "security failure: the program accepted a substituted vault account"
    );
}
