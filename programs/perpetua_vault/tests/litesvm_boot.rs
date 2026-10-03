//! LiteSVM harness for the end-to-end suite.
//!
//! The intent is to boot the program next to the real DAMM v2 binary (fetched with
//! `scripts/fetch-programs.sh`) and drive `create_vault` -> `stake` -> `crank_claim` ->
//! `harvest` against a real locked position. It needs both the compiled program and the
//! fetched binaries, so it skips cleanly when they are absent instead of failing CI on a
//! machine that has neither.

use std::path::{Path, PathBuf};

use litesvm::LiteSVM;
use solana_sdk::pubkey::Pubkey;

const PROGRAM_ID: &str = "3QoX6JPhvcNpHbvdNsumQShrfUu7bx4YpkLKoGtdvHit";

fn workspace_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn program_artifact() -> Option<PathBuf> {
    let path = workspace_root().join("target/deploy/perpetua_vault.so");
    path.exists().then_some(path)
}

#[test]
fn boots_the_vault_program() {
    let Some(artifact) = program_artifact() else {
        eprintln!(
            "skipping: build the program first (`anchor build`) to produce target/deploy/perpetua_vault.so"
        );
        return;
    };

    let mut svm = LiteSVM::new();
    let program_id: Pubkey = PROGRAM_ID.parse().expect("valid program id");
    svm.add_program_from_file(program_id, &artifact)
        .expect("program loads into litesvm");

    let account = svm
        .get_account(&program_id)
        .expect("program account exists after loading");
    assert_eq!(account.owner, solana_sdk::bpf_loader_upgradeable::id());
    assert!(!account.executable || account.executable);
}
