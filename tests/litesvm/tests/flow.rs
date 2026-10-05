//! End-to-end flow: `init_config` → `create_vault` → `crank_claim` → `harvest`, plus the rejection
//! paths, executed against the compiled program.
//!
//! The fee-bearing instructions CPI into DAMM v2. LiteSVM does not ship DAMM v2, so this suite
//! loads `tests/mock-cp-amm` **at the real cp-amm address**. The mock implements the one behaviour
//! the vault depends on — the fee delta arriving in the destination token accounts — and nothing
//! else, so what is under test here is the vault's accounting, not Meteora's.

use litesvm::LiteSVM;
use perpetua_vault_litesvm::*;
use solana_address::Address;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_signer::Signer;

const FEE_BPS: u16 = 0;

/// Boots a `World`, or skips the test when the program and the mock have not been built.
macro_rules! world {
    () => {
        match World::maybe_new() {
            Some(world) => world,
            None => {
                eprintln!(
                    "skipping: build the program and the mock first \
                     (cargo build-sbf --manifest-path programs/perpetua_vault/Cargo.toml and \
                     cargo build-sbf --manifest-path tests/mock-cp-amm/Cargo.toml)"
                );
                return;
            }
        }
    };
}

struct World {
    svm: LiteSVM,
    admin: Keypair,
    creator: Keypair,
    treasury: Keypair,
    staker: Keypair,
    pool: Keypair,
    config: Address,
    token_a_mint: Keypair,
    token_b_mint: Keypair,
    position: Keypair,
    position_nft_mint: Keypair,
    position_nft_account: Keypair,
    share_mint: Keypair,
}

impl World {
    /// Boots the program plus the SPL programs, funds the actors and lays down the pool-side
    /// fixtures. A DAMM v2 position is a real account watched by the vault, so the harness writes
    /// one with the lock buckets the vault reads.
    /// `None` when the compiled artifacts are absent, so the suite skips on a machine that has no
    /// SBF toolchain instead of failing it. Same contract as `boot.rs`.
    fn maybe_new() -> Option<Self> {
        if vault_artifact().is_none() || mock_cp_amm_artifact().is_none() {
            return None;
        }

        let mut svm = new_svm();
        // Stand in for DAMM v2 at its real address so `claim_position_fee` has a callee.
        assert!(
            load_mock_cp_amm(&mut svm),
            "build the mock first: cargo build-sbf --manifest-path tests/mock-cp-amm/Cargo.toml"
        );
        let admin = Keypair::new();
        let creator = Keypair::new();
        let treasury = Keypair::new();
        let staker = Keypair::new();
        let pool = Keypair::new();

        for actor in [&admin, &creator, &treasury, &staker, &pool] {
            fund(&mut svm, actor.pubkey(), LAMPORTS);
        }

        let (config, _) = config_pda();

        let position = Keypair::new();
        write_account(
            &mut svm,
            position.pubkey(),
            addr(CP_AMM_PROGRAM),
            position_data(0, 0, 1_000_000, 0, 0),
            LAMPORTS,
        );

        // The harness keeps the mint authority so it can fund the pool-side accounts the mock pays
        // fees out of.
        let token_a_mint = create_mint(&mut svm, &creator, 6, creator.pubkey());
        let token_b_mint = create_mint(&mut svm, &creator, 6, creator.pubkey());

        let position_nft_mint = create_mint(&mut svm, &creator, 0, creator.pubkey());
        let position_nft_account = create_token_account(
            &mut svm,
            &creator,
            position_nft_mint.pubkey(),
            creator.pubkey(),
        );

        Some(Self {
            svm,
            admin,
            creator,
            treasury,
            staker,
            pool,
            config,
            token_a_mint,
            token_b_mint,
            position,
            position_nft_mint,
            position_nft_account,
            share_mint: Keypair::new(),
        })
    }

    fn init_config(&mut self) -> Result<(), String> {
        let data = instruction_data("init_config", &FEE_BPS.to_le_bytes());
        let ix = Instruction {
            program_id: vault_program_id(),
            accounts: vec![
                writable(self.admin.pubkey(), true),
                writable(self.config, false),
                readonly(addr(SYSTEM_PROGRAM), false),
            ],
            data,
        };
        send(&mut self.svm, &self.admin, &[ix], &[&self.admin])
    }

    fn create_vault(&mut self) -> Result<(), String> {
        self.create_vault_with(addr(CP_AMM_PROGRAM))
    }

    /// `cp_amm` is a parameter so the suite can prove the address is actually pinned.
    fn create_vault_with(&mut self, cp_amm: Address) -> Result<(), String> {
        let (vault, _) = vault_pda(self.position.pubkey());
        let creator_share_account =
            associated_token_address(self.creator.pubkey(), self.share_mint.pubkey());

        let ix = Instruction {
            program_id: vault_program_id(),
            accounts: vec![
                writable(self.creator.pubkey(), true),
                readonly(self.config, false),
                readonly(self.pool.pubkey(), false),
                writable(self.position.pubkey(), false),
                readonly(self.position_nft_mint.pubkey(), false),
                writable(self.position_nft_account.pubkey(), false),
                readonly(token_program_id(), false),
                readonly(self.token_a_mint.pubkey(), false),
                readonly(self.token_b_mint.pubkey(), false),
                readonly(token_program_id(), false),
                readonly(token_program_id(), false),
                writable(vault, false),
                writable(self.share_mint.pubkey(), true),
                writable(creator_share_account, false),
                readonly(token_program_id(), false),
                readonly(addr("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), false),
                readonly(addr(SYSTEM_PROGRAM), false),
                readonly(cp_amm, false),
                readonly(addr("SysvarRent111111111111111111111111111111111"), false),
            ],
            data: instruction_data("create_vault", &[]),
        };
        send(
            &mut self.svm,
            &self.creator,
            &[ix],
            &[&self.creator, &self.share_mint],
        )
    }

    fn vault(&self) -> Address {
        vault_pda(self.position.pubkey()).0
    }
}

// ---------------------------------------------------------------------------------------------
// Account readers, laid out to match the `#[account]` structs
// ---------------------------------------------------------------------------------------------

fn u64_at(data: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(data[offset..offset + 8].try_into().unwrap())
}

fn u128_at(data: &[u8], offset: usize) -> u128 {
    u128::from_le_bytes(data[offset..offset + 16].try_into().unwrap())
}

impl World {
    fn vault_total_staked(&self) -> u64 {
        u64_at(&account_data(&self.svm, self.vault()), 296)
    }

    fn vault_acc_a(&self) -> u128 {
        u128_at(&account_data(&self.svm, self.vault()), 304)
    }

    fn vault_risk_flags(&self) -> u32 {
        let data = account_data(&self.svm, self.vault());
        u32::from_le_bytes(data[409..413].try_into().unwrap())
    }

    fn config_paused(&self) -> bool {
        account_data(&self.svm, self.config)[75] != 0
    }

    fn share_supply(&self) -> u64 {
        let data = account_data(&self.svm, self.share_mint.pubkey());
        u64::from_le_bytes(data[36..44].try_into().unwrap())
    }

    /// The share mint's authority is `COption<Pubkey>` at the start of the base mint layout.
    fn share_mint_authority_revoked(&self) -> bool {
        let data = account_data(&self.svm, self.share_mint.pubkey());
        u32::from_le_bytes(data[0..4].try_into().unwrap()) == 0
    }

    /// The vault's own token accounts, owned by the vault PDA so `harvest` can sign the payout.
    fn vault_token_accounts(&mut self) -> (Address, Address) {
        let vault = self.vault();
        let a = create_token_account(&mut self.svm, &self.creator, self.token_a_mint.pubkey(), vault);
        let b =
            create_token_account(&mut self.svm, &self.creator, self.token_b_mint.pubkey(), vault);
        (a.pubkey(), b.pubkey())
    }

    fn treasury_token_accounts(&mut self) -> (Address, Address) {
        let treasury = self.treasury.pubkey();
        let a = create_token_account(
            &mut self.svm,
            &self.creator,
            self.token_a_mint.pubkey(),
            treasury,
        );
        let b = create_token_account(
            &mut self.svm,
            &self.creator,
            self.token_b_mint.pubkey(),
            treasury,
        );
        (a.pubkey(), b.pubkey())
    }

    /// Overwrites the position fixture so the mock pays out the given fees on the next claim.
    fn set_pending_claim(&mut self, fee_a: u64, fee_b: u64) {
        write_account(
            &mut self.svm,
            self.position.pubkey(),
            addr(CP_AMM_PROGRAM),
            position_data(0, 0, 1_000_000, fee_a, fee_b),
            LAMPORTS,
        );
    }

    /// The pool-side token accounts a real claim would move fees out of, funded and owned by the
    /// vault PDA so the mock's transfer can be signed exactly as DAMM v2 would sign it.
    fn fee_source_accounts(&mut self, amount_a: u64, amount_b: u64) -> (Address, Address) {
        let (mint_a, mint_b) = (self.token_a_mint.pubkey(), self.token_b_mint.pubkey());
        let vault = self.vault();
        let a = create_token_account(&mut self.svm, &self.creator, mint_a, vault).pubkey();
        let b = create_token_account(&mut self.svm, &self.creator, mint_b, vault).pubkey();
        if amount_a > 0 {
            mint_to(&mut self.svm, &self.creator, mint_a, a, &self.creator, amount_a);
        }
        if amount_b > 0 {
            mint_to(&mut self.svm, &self.creator, mint_b, b, &self.creator, amount_b);
        }
        (a, b)
    }

    fn set_paused(&mut self, paused: bool) -> Result<(), String> {
        let ix = Instruction {
            program_id: vault_program_id(),
            accounts: vec![readonly(self.admin.pubkey(), true), writable(self.config, false)],
            data: instruction_data("set_paused", &[u8::from(paused)]),
        };
        send(&mut self.svm, &self.admin, &[ix], &[&self.admin])
    }

    #[allow(clippy::too_many_arguments)]
    fn crank_claim(
        &mut self,
        pool_a: Address,
        pool_b: Address,
        vault_a: Address,
        vault_b: Address,
        treasury_a: Address,
        treasury_b: Address,
    ) -> Result<(), String> {
        let ix = Instruction {
            program_id: vault_program_id(),
            accounts: vec![
                readonly(self.admin.pubkey(), true),
                readonly(self.config, false),
                writable(self.vault(), false),
                readonly(addr(CP_AMM_POOL_AUTHORITY), false),
                readonly(self.pool.pubkey(), false),
                writable(self.position.pubkey(), false),
                readonly(self.position_nft_account.pubkey(), false),
                readonly(self.token_a_mint.pubkey(), false),
                readonly(self.token_b_mint.pubkey(), false),
                writable(pool_a, false),
                writable(pool_b, false),
                readonly(self.pool.pubkey(), false),
                writable(vault_a, false),
                writable(vault_b, false),
                readonly(self.treasury.pubkey(), false),
                writable(treasury_a, false),
                writable(treasury_b, false),
                readonly(token_program_id(), false),
                readonly(token_program_id(), false),
                readonly(addr(CP_AMM_PROGRAM), false),
            ],
            data: instruction_data("crank_claim", &[]),
        };
        send(&mut self.svm, &self.admin, &[ix], &[&self.admin])
    }

    fn harvest(
        &mut self,
        vault_a: Address,
        vault_b: Address,
        owner_a: Address,
        owner_b: Address,
    ) -> Result<(), String> {
        let stake = stake_pda(self.vault(), self.staker.pubkey()).0;
        let ix = Instruction {
            program_id: vault_program_id(),
            accounts: vec![
                writable(self.staker.pubkey(), true),
                writable(self.vault(), false),
                writable(stake, false),
                readonly(self.token_a_mint.pubkey(), false),
                readonly(self.token_b_mint.pubkey(), false),
                writable(vault_a, false),
                writable(vault_b, false),
                writable(owner_a, false),
                writable(owner_b, false),
                readonly(token_program_id(), false),
                readonly(token_program_id(), false),
            ],
            data: instruction_data("harvest", &[]),
        };
        send(&mut self.svm, &self.staker, &[ix], &[&self.staker])
    }

    /// Seeds the stake account directly. `stake` itself needs the DAMM v2 claim, so seeding is what
    /// lets the payout side be exercised on its own.
    fn seed_stake(&mut self, amount: u64, pending_a: u64, pending_b: u64) -> Address {
        let vault = self.vault();
        let owner = self.staker.pubkey();
        let (stake, bump) = stake_pda(vault, owner);
        let seed = StakeSeed {
            vault,
            owner,
            amount,
            debt_a: self.vault_acc_a(),
            debt_b: 0,
            pending_a,
            pending_b,
        };
        write_account(
            &mut self.svm,
            stake,
            vault_program_id(),
            stake_data(&seed, bump),
            LAMPORTS,
        );

        // `stake` normally keeps `Vault.total_staked` in step with the stake accounts. Seeding the
        // stake directly means the harness has to do it: with `total_staked == 0` the claim would be
        // banked as carry instead of accruing to the accumulator.
        let mut vault_data = account_data(&self.svm, vault);
        vault_data[296..304].copy_from_slice(&amount.to_le_bytes());
        write_account(&mut self.svm, vault, vault_program_id(), vault_data, LAMPORTS);

        stake
    }
}

fn expect_failure(result: Result<(), String>, needle: &str) {
    match result {
        Ok(()) => panic!("expected the transaction to fail with {needle}"),
        Err(message) => assert!(
            message.contains(needle),
            "expected the failure to mention {needle}, got:\n{message}"
        ),
    }
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

/// A Token-2022 mint carrying a `TransferHook` extension: base mint, account-type byte, then TLV.
fn token_2022_mint_with_transfer_hook() -> Vec<u8> {
    let mut data = vec![0u8; 82];
    data.push(1); // account type: Mint
    data.extend_from_slice(&14u16.to_le_bytes()); // TransferHook
    data.extend_from_slice(&64u16.to_le_bytes());
    data.extend_from_slice(&[0u8; 64]);
    data
}

#[test]
fn init_config_creates_the_account() {
    let mut world = world!();
    world.init_config().expect("init_config");

    let data = account_data(&world.svm, world.config);
    assert_eq!(data.len(), 76);
    assert_eq!(&data[8..40], world.admin.pubkey().as_ref());
    // `init_config` currently wires the treasury to the admin rather than taking it as an argument;
    // see docs/SECURITY.md.
    assert_eq!(&data[40..72], world.admin.pubkey().as_ref());
    assert_eq!(u16::from_le_bytes(data[72..74].try_into().unwrap()), FEE_BPS);
    assert!(!world.config_paused());
}

#[test]
fn create_vault_securitizes_the_position() {
    let mut world = world!();
    world.init_config().expect("init_config");
    world.create_vault().expect("create_vault");

    // Fixed supply, mint authority revoked: nobody can ever mint more shares.
    assert_eq!(world.share_supply(), 1_000_000_000_000);
    assert!(world.share_mint_authority_revoked());

    // The position NFT account now answers to the vault PDA.
    assert_eq!(
        token_authority(&world.svm, world.position_nft_account.pubkey()),
        world.vault()
    );

    // Accounting starts clean, and classic mints raise no risk flags.
    assert_eq!(world.vault_total_staked(), 0);
    assert_eq!(world.vault_acc_a(), 0);
    assert_eq!(world.vault_risk_flags(), 0);

    // The whole supply landed in the creator's associated token account, which the program created.
    let creator_ata = associated_token_address(world.creator.pubkey(), world.share_mint.pubkey());
    assert_eq!(token_amount(&world.svm, creator_ata), 1_000_000_000_000);
    assert_eq!(token_mint_of(&world.svm, creator_ata), world.share_mint.pubkey());
}

#[test]
fn create_vault_rejects_an_unlocked_position() {
    let mut world = world!();
    world.init_config().expect("init_config");
    // One unit of unlocked liquidity: not a fully locked position.
    write_account(
        &mut world.svm,
        world.position.pubkey(),
        addr(CP_AMM_PROGRAM),
        position_data(1, 0, 1_000_000, 0, 0),
        LAMPORTS,
    );
    expect_failure(world.create_vault(), "PositionNotFullyLocked");
}

#[test]
fn create_vault_rejects_a_position_without_a_permanent_lock() {
    let mut world = world!();
    world.init_config().expect("init_config");
    write_account(
        &mut world.svm,
        world.position.pubkey(),
        addr(CP_AMM_PROGRAM),
        position_data(0, 0, 0, 0, 0),
        LAMPORTS,
    );
    expect_failure(world.create_vault(), "NoPermanentLock");
}

#[test]
fn create_vault_rejects_a_transfer_hook_mint() {
    let mut world = world!();
    world.init_config().expect("init_config");

    let hooked = Keypair::new();
    write_account(
        &mut world.svm,
        hooked.pubkey(),
        addr(TOKEN_2022_PROGRAM),
        token_2022_mint_with_transfer_hook(),
        LAMPORTS,
    );
    world.token_a_mint = hooked;

    expect_failure(world.create_vault(), "TransferHookMint");
}

#[test]
fn create_vault_rejects_a_substituted_cp_amm_program() {
    // The CPI signs with the vault PDA over the vault's own fee token accounts. If the cp-amm
    // address were not pinned, a caller could point the vault at a program that simply moves those
    // balances away. This asserts the pin holds.
    let mut world = world!();
    world.init_config().expect("init_config");
    expect_failure(
        world.create_vault_with(Keypair::new().pubkey()),
        "ConstraintAddress",
    );
}

#[test]
fn the_pause_switch_blocks_entry_only() {
    let mut world = world!();
    world.init_config().expect("init_config");
    world.set_paused(true).expect("set_paused");
    assert!(world.config_paused());

    expect_failure(world.create_vault(), "EntryPaused");

    world.set_paused(false).expect("unpause");
    world.create_vault().expect("create_vault after unpause");
}

#[test]
fn crank_claim_then_harvest_pays_the_staker() {
    let mut world = world!();
    world.init_config().expect("init_config");
    world.create_vault().expect("create_vault");

    let (vault_a, vault_b) = world.vault_token_accounts();
    let (treasury_a, treasury_b) = world.treasury_token_accounts();

    // Someone has to be staked, otherwise the claim is banked as carry rather than accrued.
    world.seed_stake(1_000_000, 0, 0);

    // The mock moves this out of the pool-side accounts and into the vault's while the CPI is on the
    // stack. The vault books it as a balance diff, exactly as it does for a real DAMM v2 claim.
    let (pool_a, pool_b) = world.fee_source_accounts(1_000, 2_000);
    world.set_pending_claim(1_000, 2_000);
    world
        .crank_claim(pool_a, pool_b, vault_a, vault_b, treasury_a, treasury_b)
        .expect("crank_claim");

    // acc_fee_per_share_a = 1000 * 1e18 / 1e6
    assert_eq!(world.vault_acc_a(), 1_000 * 10u128.pow(18) / 1_000_000);
    assert_eq!(token_amount(&world.svm, vault_a), 1_000);

    // The staker's own token accounts, then the payout.
    let mint_a = world.token_a_mint.pubkey();
    let mint_b = world.token_b_mint.pubkey();
    let staker = world.staker.pubkey();
    let owner_a = create_token_account(&mut world.svm, &world.staker, mint_a, staker).pubkey();
    let owner_b = create_token_account(&mut world.svm, &world.staker, mint_b, staker).pubkey();

    world
        .harvest(vault_a, vault_b, owner_a, owner_b)
        .expect("harvest");

    // 1e6 staked * 1e15 acc / 1e18 = 1000 of token A.
    assert_eq!(token_amount(&world.svm, owner_a), 1_000);
    assert_eq!(token_amount(&world.svm, owner_b), 2_000);
    assert_eq!(token_amount(&world.svm, vault_a), 0);
    assert_eq!(token_amount(&world.svm, vault_b), 0);

    // Pending is cleared, so a second harvest cannot pay twice.
    let stake = stake_pda(world.vault(), staker).0;
    assert_eq!(u64_at(&account_data(&world.svm, stake), 112), 0);
    expect_failure(
        world.harvest(vault_a, vault_b, owner_a, owner_b),
        "NothingToHarvest",
    );
}


