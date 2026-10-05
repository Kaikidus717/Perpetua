//! Harness that drives the **compiled** `perpetua_vault` program inside LiteSVM.
//!
//! Nothing here is mocked away from the program's point of view: instructions are serialised with
//! the same discriminator rule the IDL uses, accounts are handed over as real accounts, the SPL
//! token program is the real one bundled with LiteSVM, and the vault PDA signs for real. What is
//! synthetic is the *state* the program reads — the DAMM v2 position and the stake accounts — which
//! is exactly what a fork test would snapshot instead.
//!
//! The one external program the fee flow needs is DAMM v2 itself. LiteSVM does not ship it, so the
//! harness loads a **mock** at the real cp-amm address; see `tests/mock-cp-amm`.

use litesvm::LiteSVM;
use solana_address::Address;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;

// ---------------------------------------------------------------------------------------------
// Program ids
// ---------------------------------------------------------------------------------------------

/// Taken from the program crate, so the harness can never disagree with `declare_id!`.
pub fn vault_program_id() -> Address {
    Address::new_from_array(perpetua_vault::ID.to_bytes())
}

pub const TOKEN_PROGRAM: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
pub const TOKEN_2022_PROGRAM: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
pub const SYSTEM_PROGRAM: &str = "11111111111111111111111111111111";
/// Matches `CP_AMM_PROGRAM_ID` in `programs/perpetua_vault/src/constants.rs`.
pub const CP_AMM_PROGRAM: &str = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
/// Matches `CP_AMM_POOL_AUTHORITY`.
pub const CP_AMM_POOL_AUTHORITY: &str = "HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC";

pub fn addr(value: &str) -> Address {
    value.parse().expect("valid base58 address")
}

pub fn token_program_id() -> Address {
    addr(TOKEN_PROGRAM)
}

// ---------------------------------------------------------------------------------------------
// Anchor serialisation, derived exactly the way scripts/gen-idl.mjs derives it
// ---------------------------------------------------------------------------------------------

pub fn anchor_discriminator(prefix: &str, name: &str) -> [u8; 8] {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(format!("{prefix}:{name}").as_bytes());
    let digest = hasher.finalize();
    let mut out = [0u8; 8];
    out.copy_from_slice(&digest[..8]);
    out
}

pub fn instruction_data(name: &str, args: &[u8]) -> Vec<u8> {
    let mut data = anchor_discriminator("global", name).to_vec();
    data.extend_from_slice(args);
    data
}

pub fn account_discriminator(name: &str) -> [u8; 8] {
    anchor_discriminator("account", name)
}

pub fn writable(pubkey: Address, signer: bool) -> AccountMeta {
    AccountMeta {
        pubkey,
        is_signer: signer,
        is_writable: true,
    }
}

pub fn readonly(pubkey: Address, signer: bool) -> AccountMeta {
    AccountMeta {
        pubkey,
        is_signer: signer,
        is_writable: false,
    }
}

// ---------------------------------------------------------------------------------------------
// PDAs
// ---------------------------------------------------------------------------------------------

pub fn config_pda() -> (Address, u8) {
    Address::find_program_address(&[b"config"], &vault_program_id())
}

pub fn vault_pda(position: Address) -> (Address, u8) {
    Address::find_program_address(&[b"vault", position.as_ref()], &vault_program_id())
}

pub fn stake_pda(vault: Address, owner: Address) -> (Address, u8) {
    Address::find_program_address(&[b"stake", vault.as_ref(), owner.as_ref()], &vault_program_id())
}

// ---------------------------------------------------------------------------------------------
// SVM construction and transaction plumbing
// ---------------------------------------------------------------------------------------------

pub fn new_svm() -> LiteSVM {
    let mut svm = LiteSVM::new()
        .with_builtins()
        .with_sysvars()
        .with_default_programs()
        // Tests deliberately replay the same instruction (for example `create_vault` before and
        // after unpausing), and the default history rejects an identical transaction as a
        // duplicate. Disable it so replaying a call is a normal, observable outcome.
        .with_transaction_history(0);
    if let Some(so) = vault_artifact() {
        svm.add_program_from_file(vault_program_id(), so)
            .expect("perpetua_vault loads into litesvm");
    }
    svm
}

fn workspace_root() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(std::path::Path::parent)
        .map(std::path::Path::to_path_buf)
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}

pub fn vault_artifact() -> Option<std::path::PathBuf> {
    let path = workspace_root().join("target/deploy/perpetua_vault.so");
    path.exists().then_some(path)
}

/// The mock DAMM v2 program, built separately:
/// `cargo build-sbf --manifest-path tests/mock-cp-amm/Cargo.toml`.
pub fn mock_cp_amm_artifact() -> Option<std::path::PathBuf> {
    let path = workspace_root().join("tests/mock-cp-amm/target/deploy/mock_cp_amm.so");
    path.exists().then_some(path)
}

pub fn load_mock_cp_amm(svm: &mut LiteSVM) -> bool {
    match mock_cp_amm_artifact() {
        Some(so) => {
            svm.add_program_from_file(addr(CP_AMM_PROGRAM), so)
                .expect("mock cp-amm loads into litesvm");
            true
        }
        None => false,
    }
}

/// Builds, signs and submits one transaction. Returns logs on failure so tests can assert on the
/// exact Anchor error code instead of just "it failed".
pub fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    instructions: &[Instruction],
    signers: &[&Keypair],
) -> Result<(), String> {
    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(instructions, Some(&payer.pubkey()), &blockhash);
    let tx = Transaction::new(signers, message, blockhash);
    svm.send_transaction(tx).map(|_| ()).map_err(|err| {
        let logs = err.meta.logs.join("\n");
        format!("{:?}\n{logs}", err.err)
    })
}

pub fn account_data(svm: &LiteSVM, pubkey: Address) -> Vec<u8> {
    svm.get_account(&pubkey)
        .map(|account| account.data)
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------------------------
// Account fixtures
// ---------------------------------------------------------------------------------------------

pub const POSITION_LEN: usize = 216;
pub const POSITION_UNLOCKED_OFFSET: usize = 152;
pub const POSITION_VESTED_OFFSET: usize = 168;
pub const POSITION_PERMANENT_LOCK_OFFSET: usize = 184;
/// Test-only convention: the mock cp-amm reads the fee it should pay out from here, so a test can
/// steer the payout (including zero) without changing the mock's binary.
pub const POSITION_FEE_A_OFFSET: usize = 200;
pub const POSITION_FEE_B_OFFSET: usize = 208;

/// A DAMM v2 `Position` as the program reads it: only the three lock buckets matter, plus the two
/// test-only fee slots the mock uses.
pub fn position_data(
    unlocked: u128,
    vested: u128,
    permanent: u128,
    fee_a: u64,
    fee_b: u64,
) -> Vec<u8> {
    let mut data = vec![0u8; POSITION_LEN];
    data[..8].copy_from_slice(&account_discriminator("Position"));
    data[POSITION_UNLOCKED_OFFSET..POSITION_UNLOCKED_OFFSET + 16]
        .copy_from_slice(&unlocked.to_le_bytes());
    data[POSITION_VESTED_OFFSET..POSITION_VESTED_OFFSET + 16].copy_from_slice(&vested.to_le_bytes());
    data[POSITION_PERMANENT_LOCK_OFFSET..POSITION_PERMANENT_LOCK_OFFSET + 16]
        .copy_from_slice(&permanent.to_le_bytes());
    data[POSITION_FEE_A_OFFSET..POSITION_FEE_A_OFFSET + 8].copy_from_slice(&fee_a.to_le_bytes());
    data[POSITION_FEE_B_OFFSET..POSITION_FEE_B_OFFSET + 8].copy_from_slice(&fee_b.to_le_bytes());
    data
}

/// A `Stake` account the harness seeds directly, so the payout paths can be exercised without first
/// running the DAMM v2 claim.
pub struct StakeSeed {
    pub vault: Address,
    pub owner: Address,
    pub amount: u64,
    pub debt_a: u128,
    pub debt_b: u128,
    pub pending_a: u64,
    pub pending_b: u64,
}

pub fn stake_data(seed: &StakeSeed, bump: u8) -> Vec<u8> {
    let mut data = account_discriminator("Stake").to_vec();
    data.extend_from_slice(seed.vault.as_ref());
    data.extend_from_slice(seed.owner.as_ref());
    data.extend_from_slice(&seed.amount.to_le_bytes());
    data.extend_from_slice(&seed.debt_a.to_le_bytes());
    data.extend_from_slice(&seed.debt_b.to_le_bytes());
    data.extend_from_slice(&seed.pending_a.to_le_bytes());
    data.extend_from_slice(&seed.pending_b.to_le_bytes());
    data.push(bump);
    data
}

pub fn write_account(
    svm: &mut LiteSVM,
    pubkey: Address,
    owner: Address,
    data: Vec<u8>,
    lamports: u64,
) {
    svm.set_account(
        pubkey,
        solana_account::Account {
            lamports,
            data,
            owner,
            executable: false,
            rent_epoch: 0,
        },
    )
    .expect("set_account");
}

pub fn token_amount(svm: &LiteSVM, pubkey: Address) -> u64 {
    let data = account_data(svm, pubkey);
    if data.len() < 72 {
        return 0;
    }
    u64::from_le_bytes(data[64..72].try_into().unwrap())
}

/// Owner of a token account: the authority recorded in the account's `owner` field.
pub fn token_authority(svm: &LiteSVM, pubkey: Address) -> Address {
    let data = account_data(svm, pubkey);
    Address::new_from_array(data[32..64].try_into().unwrap())
}

pub fn token_mint_of(svm: &LiteSVM, pubkey: Address) -> Address {
    let data = account_data(svm, pubkey);
    Address::new_from_array(data[0..32].try_into().unwrap())
}

// ---------------------------------------------------------------------------------------------
// SPL fixtures — real token-program calls, not hand-written account bytes
// ---------------------------------------------------------------------------------------------

/// Enough to clear the rent-exempt floor for every fixture account several times over.
pub const LAMPORTS: u64 = 10_000_000;

const MINT_LEN: usize = 82;
const TOKEN_ACCOUNT_LEN: usize = 165;
const SPL_INITIALIZE_MINT2: u8 = 20;
const SPL_INITIALIZE_ACCOUNT3: u8 = 18;

pub fn fund(svm: &mut LiteSVM, pubkey: Address, lamports: u64) {
    svm.airdrop(&pubkey, lamports).expect("airdrop");
}

fn allocate(svm: &mut LiteSVM, pubkey: Address, size: usize) {
    write_account(svm, pubkey, token_program_id(), vec![0u8; size], LAMPORTS);
}

/// Creates a classic SPL mint through `InitializeMint2`, so the account is one the token program
/// itself considers valid.
pub fn create_mint(
    svm: &mut LiteSVM,
    payer: &Keypair,
    decimals: u8,
    authority: Address,
) -> Keypair {
    let mint = Keypair::new();
    allocate(svm, mint.pubkey(), MINT_LEN);

    let mut data = vec![SPL_INITIALIZE_MINT2, decimals];
    data.extend_from_slice(authority.as_ref());
    data.push(0); // no freeze authority

    let ix = Instruction {
        program_id: token_program_id(),
        accounts: vec![writable(mint.pubkey(), false)],
        data,
    };
    send(svm, payer, &[ix], &[payer]).expect("initialize mint");
    mint
}

pub fn create_token_account(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: Address,
    owner: Address,
) -> Keypair {
    let account = Keypair::new();
    allocate(svm, account.pubkey(), TOKEN_ACCOUNT_LEN);

    let mut data = vec![SPL_INITIALIZE_ACCOUNT3];
    data.extend_from_slice(owner.as_ref());

    // `InitializeAccount3` reads the mint account to stamp the new token account's mint field, so
    // the mint has to be handed over alongside the account being initialised.
    let ix = Instruction {
        program_id: token_program_id(),
        accounts: vec![
            writable(account.pubkey(), false),
            readonly(mint, false),
        ],
        data,
    };
    send(svm, payer, &[ix], &[payer]).expect("initialize token account");
    account
}

/// The associated token address for a classic-SPL mint: `[wallet, token_program, mint]` under the
/// associated token program.
pub fn associated_token_address(wallet: Address, mint: Address) -> Address {
    Address::find_program_address(
        &[wallet.as_ref(), token_program_id().as_ref(), mint.as_ref()],
        &addr("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    )
    .0
}

const SPL_MINT_TO: u8 = 7;

/// Funds a token account through the real token program, so the fixture balances the mock pays out
/// from are ones the token program itself produced.
pub fn mint_to(
    svm: &mut LiteSVM,
    payer: &Keypair,
    mint: Address,
    destination: Address,
    authority: &Keypair,
    amount: u64,
) {
    let mut data = vec![SPL_MINT_TO];
    data.extend_from_slice(&amount.to_le_bytes());
    let ix = Instruction {
        program_id: token_program_id(),
        accounts: vec![
            writable(mint, false),
            writable(destination, false),
            readonly(authority.pubkey(), true),
        ],
        data,
    };
    send(svm, payer, &[ix], &[payer, authority]).expect("mint to");
}

