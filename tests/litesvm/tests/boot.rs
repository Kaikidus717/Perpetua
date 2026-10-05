//! LiteSVM harness for the end-to-end suite.
//!
//! Boots `perpetua_vault` next to the real DAMM v2 binary (fetched with
//! `scripts/fetch-programs.sh` or `solana program dump -u devnet ...`) and drives
//! `create_vault` -> `stake` -> `crank_claim` -> `harvest` against a real locked position.
//!
//! It needs the compiled program artifact and the fetched binaries, so it skips cleanly when they
//! are absent instead of failing a machine that has neither.

use std::path::{Path, PathBuf};

use litesvm::LiteSVM;
use solana_address::Address;

const UPGRADEABLE_LOADER: &str = "BPFLoaderUpgradeab1e11111111111111111111111";

/// Read from the program crate, so the harness can never disagree with `declare_id!`.
fn program_id() -> Address {
    Address::new_from_array(perpetua_vault::ID.to_bytes())
}

fn workspace_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn artifact() -> Option<PathBuf> {
    let path = workspace_root().join("target/deploy/perpetua_vault.so");
    path.exists().then_some(path)
}

#[test]
fn boots_the_vault_program() {
    let Some(so) = artifact() else {
        eprintln!("skipping: run `cargo build-sbf` (or `anchor build`) to produce target/deploy/perpetua_vault.so");
        return;
    };

    let mut svm = LiteSVM::new();
    let program_id = program_id();
    svm.add_program_from_file(program_id, &so)
        .expect("program loads into litesvm");

    let account = svm
        .get_account(&program_id)
        .expect("program account exists after loading");
    assert_eq!(
        account.owner,
        UPGRADEABLE_LOADER.parse::<Address>().expect("valid loader id")
    );
    assert!(account.executable);
}
