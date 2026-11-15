# Perpetua: DAO treasury security and devnet testing

For DAO and multisig treasury teams evaluating Perpetua. Perpetua takes custody of position NFTs, so
security is the product, not a feature.

## 1. Network status

- **Mainnet** — the Pricing Terminal is live. Paste any DAMM v2 pool to see its fair value, the
  bear/base/bull range and its risk flags.
- **Devnet** — the full securitization flow is live: create a vault, stake shares, crank and harvest
  fees, and build unsigned transactions for a multisig to sign.

## 2. The three checks before any transaction is built

1. **Position eligibility.** The DAMM v2 position must be permanently locked — unlocked and vesting
   liquidity both at zero. A mixed position is refused, because the unlocked part could still be
   withdrawn after shares were sold against it.
2. **Token safety.** The fee mints are inspected for Token-2022 extensions. A mint carrying a
   **transfer hook** is refused at vault creation: the vault cannot account for fees it cannot see.
   A fee mint that is later paused or blocked does not trap holders either — `Force exit` releases
   shares without claiming.
3. **Valuation sanity.** The decay model is fitted to trailing fees. A pool younger than a full day
   has no fee history to fit, so pricing refuses it with a sentence rather than a number; thin or
   young pools are surfaced as risk flags next to the figure.

## 3. The unsigned transaction flow

- Perpetua never holds a private key and never asks for one.
- The API (and the MCP server) runs the checks above and returns an **unsigned** transaction.
- The wallet — or a Squads multisig — reviews and signs it. Nothing happens without that signature.

## 4. The payload-swap test

Most losses in this category come from the interface, not the contract: a transaction is approved in
a readable form and executed in a different one. Perpetua's defence is that the program validates its
own accounts on chain — the vault is keyed by the position, `has_one = pool` pins the pool, the share
mint is pinned by address, and the cp-amm program id is asserted on every account struct that
receives it. Altering the payload after approval makes those checks fail.

### Testing it with Squads on devnet

1. Propose a transaction in Squads that calls `create_vault`.
2. Before the final signature, alter the payload — point the position or pool account somewhere else.
3. Attempt to execute. The program rejects the altered payload with a constraint error, not a silent
   success. The treasury is unchanged.

The same rejection is covered by the LiteSVM suite, where the substituted-program and
transfer-hook-mint cases are asserted directly (`create_vault_rejects_a_substituted_cp_amm_program`,
`create_vault_rejects_a_transfer_hook_mint`).
