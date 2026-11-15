"use client";

import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { RPC_URL } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, LINK, META, PAGE } from "@/lib/ui";
import { useSolanaWallet } from "@/lib/wallet";
import { Connection, PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

/// Squads' devnet app. A treasury team creates its multisig there, then pastes the address into
/// `MULTISIG` below so the third card links straight to it.
const MULTISIG = "";
const SQUADS = MULTISIG
  ? `https://devnet.squads.so/multisig/${MULTISIG}`
  : "https://devnet.squads.so";

const AIRDROP_LAMPORTS = 2_000_000_000;

export default function SandboxPage() {
  const wallet = useSolanaWallet();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  /// The test position comes from the API rather than a hardcoded string, so it is always a live
  /// devnet position that can actually be securitized.
  const vaults = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });
  const testPosition = vaults.data?.vaults[0]?.position ?? null;

  async function airdrop() {
    if (!wallet.address) return;
    setBusy(true);
    setNote(null);
    try {
      const connection = new Connection(RPC_URL, "confirmed");
      const signature = await connection.requestAirdrop(
        new PublicKey(wallet.address),
        AIRDROP_LAMPORTS,
      );
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
      setNote(`2 devnet SOL sent. Transaction ${signature.slice(0, 12)}…`);
    } catch (cause) {
      /// The public devnet faucet rate-limits by IP and by wallet. Saying so beats a spinner.
      setNote(
        `No airdrop: ${cause instanceof Error ? cause.message : String(cause)}. The public devnet faucet rate-limits — try again later, or use faucet.solana.com with this wallet.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNote("Copy failed — select the address and copy it manually.");
    }
  }

  return (
    <div className={PAGE}>
      <PageHeader
        title="DAO treasury sandbox"
        description="Test the payload-swap rejection flow on devnet, with no real funds at risk."
      />

      <section className={`${CARD} space-y-3 p-4 sm:p-5`}>
        <h2 className="text-[13px] font-semibold text-ink">1 · Test funds</h2>
        <p className={`${META} leading-5`}>
          A devnet wallet needs SOL for rent and fees. Two is enough for a vault and a dozen
          transactions.
        </p>
        {wallet.address ? (
          <button
            type="button"
            onClick={() => void airdrop()}
            disabled={busy}
            className={BUTTON_PRIMARY}
          >
            {busy ? "Requesting…" : "Request 2 devnet SOL"}
          </button>
        ) : (
          <button type="button" onClick={() => void wallet.connect()} className={BUTTON}>
            Connect a wallet first
          </button>
        )}
      </section>

      <section className={`${CARD} space-y-3 p-4 sm:p-5`}>
        <h2 className="text-[13px] font-semibold text-ink">2 · Test position</h2>
        <p className={`${META} leading-5`}>
          A live devnet position from our test vault. Paste it into Create shares to walk the
          securitization flow.
        </p>
        {testPosition ? (
          <>
            <p className="break-all font-mono text-[12px] text-ink">{testPosition}</p>
            <button type="button" onClick={() => void copy(testPosition)} className={BUTTON}>
              {copied ? "Copied" : "Copy test position address"}
            </button>
          </>
        ) : (
          <p className={META}>No devnet position is registered with the API right now.</p>
        )}
      </section>

      <section className={`${CARD} space-y-3 p-4 sm:p-5`}>
        <h2 className="text-[13px] font-semibold text-ink">3 · The payload-swap test</h2>
        <p className={`${META} leading-5`}>
          In Squads, propose a <span className="text-ink">create_vault</span> transaction, alter the
          payload before the final signature, then execute. The program rejects the altered payload
          — the vault is keyed by the position and the pool is pinned, so a swapped account cannot
          resolve. The same case is asserted in{" "}
          <span className="text-ink">tests/litesvm/tests/payload_swap_rejection.rs</span>.
        </p>
        <a href={SQUADS} target="_blank" rel="noreferrer" className={BUTTON}>
          Open devnet Squads ↗
        </a>
      </section>

      {note ? <p className={`${META} break-all`}>{note}</p> : null}

      <p className={META}>
        Devnet only. Nothing here touches mainnet or real funds. The full flow is written up in{" "}
        <span className="text-ink">WALKTHROUGH.md</span> at the repository root.
      </p>
    </div>
  );
}
