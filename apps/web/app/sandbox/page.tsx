"use client";

import { PageHeader } from "@/components/PageHeader";
import { SandboxFunds } from "@/components/SandboxFunds";
import { SandboxSecuritizer } from "@/components/SandboxSecuritizer";
import { api } from "@/lib/api";
import { explorerUrl, shortAddress } from "@/lib/format";
import { BUTTON, CARD, LINK, META, PAGE } from "@/lib/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

/// Squads' devnet app. Create the multisig there, then set `NEXT_PUBLIC_SANDBOX_MULTISIG` in the
/// deployment and this card links straight to it — no code change needed.
const MULTISIG = process.env.NEXT_PUBLIC_SANDBOX_MULTISIG ?? "";
const SQUADS = MULTISIG
  ? `https://devnet.squads.so/multisig/${MULTISIG}`
  : "https://devnet.squads.so";

export default function SandboxPage() {
  const [copied, setCopied] = useState<string | null>(null);
  const vaults = useQuery({ queryKey: ["vaults"], queryFn: api.vaults });
  const reference = vaults.data?.vaults[0] ?? null;

  async function copy(label: string, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied("copy-failed");
    }
  }

  return (
    <div className={PAGE}>
      <PageHeader
        title="DAO treasury sandbox"
        description="A self-contained devnet rehearsal: fund a wallet, create a locked position, securitize it, then test the payload-swap rejection. No mainnet, no real funds."
      />

      <SandboxFunds />
      <SandboxSecuritizer />

      <div className="grid gap-3 lg:grid-cols-2">
        <section className={`${CARD} space-y-3 p-4 sm:p-5`}>
          <h2 className="text-[13px] font-semibold text-ink">3 · The payload-swap test</h2>
          <p className={`${META} leading-5`}>
            In Squads, propose a <span className="text-ink">create_vault</span> transaction, alter
            the payload before the final signature, then execute. The program rejects the altered
            payload: the vault is keyed by the position, the pool is pinned with{" "}
            <span className="font-mono text-[11px] text-ink">has_one</span>, and the cp-amm program
            id is asserted.
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-6 text-muted">
            <li>Propose create_vault in the Squads devnet multisig.</li>
            <li>Change the position, pool or destination account before the final signature.</li>
            <li>Execute. The altered payload fails a constraint — the treasury is unchanged.</li>
          </ol>
          <a href={SQUADS} target="_blank" rel="noreferrer" className={BUTTON}>
            Open devnet Squads ↗
          </a>
          <p className={`${META} leading-5`}>
            The same rejection is asserted in{" "}
            <span className="break-all font-mono text-[11px] text-ink">
              tests/litesvm/tests/payload_swap_rejection.rs
            </span>
            . On devnet, a mutated discriminator returns{" "}
            <span className="font-mono text-[11px] text-ink">
              InstructionFallbackNotFound (101)
            </span>{" "}
            before an account is touched.
          </p>
        </section>

        <section className={`${CARD} space-y-3 p-4 sm:p-5`}>
          <h2 className="text-[13px] font-semibold text-ink">4 · Live devnet reference</h2>
          <p className={`${META} leading-5`}>
            Read-only: the first vault the API knows about. Copy its position if you want to inspect
            a real account. To securitize, use your own position in the securitizer above.
          </p>
          {reference ? (
            <>
              <p className="break-all font-mono text-[12px] text-ink">{reference.position}</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copy("position", reference.position)}
                  className={BUTTON}
                >
                  {copied === "position" ? "Copied" : "Copy position"}
                </button>
                <a
                  href={explorerUrl(reference.position, "devnet")}
                  target="_blank"
                  rel="noreferrer"
                  className={BUTTON}
                >
                  Open on Explorer ↗
                </a>
              </div>
              <p className={`${META} break-all leading-5`}>
                vault{" "}
                <Link href={`/vault/${reference.address}`} className={LINK}>
                  {shortAddress(reference.address)}
                </Link>{" "}
                · share mint {shortAddress(reference.shareMint)}
              </p>
            </>
          ) : vaults.isError ? (
            <p className="text-[13px] leading-5 text-warn">
              The API did not answer, so there is no live reference right now. The securitizer above
              still works: it scans the chain directly once a wallet is connected.
            </p>
          ) : (
            <p className={META}>No vault has been registered on devnet yet.</p>
          )}
        </section>
      </div>

      <p className={`${META} leading-5`}>
        Devnet only. Nothing here touches mainnet or real funds. The full flow is written up in{" "}
        <span className="text-ink">WALKTHROUGH.md</span> at the repository root; the same content is
        in the{" "}
        <Link href="/walkthrough" className={LINK}>
          walkthrough
        </Link>
        .
      </p>
    </div>
  );
}
