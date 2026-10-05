# Program keypairs

`perpetua_vault-devnet.json` is the keypair for the **devnet-only** deployment of `perpetua_vault`.
Its public key is the address in `declare_id!`:

```
G7ixan3xxy2SRR84Qnv7pUAh1wSinYdhzKwJyhFfqWH2
```

It is committed on purpose. A Solana program address can only be deployed by whoever holds the
keypair for it, so committing this file is what makes the deployed address **reproducible**: a clean
clone builds the same program ID and can deploy to the same devnet address that judges are pointed
at. The key holds no value and controls nothing but that throwaway devnet program. Treat it as
public — it is in a public repository.

**Mainnet must not use this key.** A mainnet deployment gets a fresh keypair, kept in a secret store
and never committed; only `declare_id!` and `Anchor.toml` change.

## Usage

`anchor build` and `anchor deploy` look for `target/deploy/perpetua_vault-keypair.json`, which
`.gitignore` excludes. Install the committed key first:

```bash
node scripts/program-id.mjs install-keypair
```

`declare_id!` in `programs/perpetua_vault/src/lib.rs` is the single source of truth. Everything else
— the IDL, the SDK constants, the LiteSVM harness — derives from it. To check or repair the
Anchor.toml entries:

```bash
node scripts/program-id.mjs check   # fails if Anchor.toml drifted
node scripts/program-id.mjs sync    # rewrites Anchor.toml from declare_id!
```
