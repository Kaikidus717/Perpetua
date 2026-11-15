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

/// Squads' devnet app. Create a shared wallet there, then set
/// `NEXT_PUBLIC_SANDBOX_MULTISIG` in the deployment and this card links straight to it.
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
        title="Perpetua sandbox"
        description="Try the whole flow with test money: get test SOL, create a locked position, turn it into shares, and see why a changed transaction is rejected. No real funds."
      />

      <SandboxFunds />
      <SandboxSecuritizer />

      <div className="grid gap-3 lg:grid-cols-2">
        <section className={`${CARD} space-y-3 p-4 sm:p-5`}>
          <h2 className="text-[13px] font-semibold text-ink">3 · Test a changed transaction</h2>
          <p className={`${META} leading-5`}>
            If you share a wallet with other people, test what happens when a transaction changes
            after approval. Squads is a shared wallet you can use on devnet.
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-6 text-muted">
            <li>Propose a transaction that turns a position into shares.</li>
            <li>Change an account before the final signature.</li>
            <li>Try to send it. Perpetua rejects it, and nothing moves.</li>
          </ol>
          <a href={SQUADS} target="_blank" rel="noreferrer" className={BUTTON}>
            Open devnet Squads ↗
          </a>
          <details className="text-[12px]">
            <summary className="w-fit cursor-pointer text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">
              Technical detail
            </summary>
            <p className={`${META} mt-2 leading-5`}>
              Both cases are covered by an automated test. A changed instruction is rejected on
              devnet before an account is touched.
            </p>
          </details>
        </section>

        <section className={`${CARD} space-y-3 p-4 sm:p-5`}>
          <h2 className="text-[13px] font-semibold text-ink">4 · A live example</h2>
          <p className={`${META} leading-5`}>
            This is the first vault on devnet. Copy its position or open it in Explorer. To make
            your own shares, use the section above.
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
                · share token {shortAddress(reference.shareMint)}
              </p>
            </>
          ) : vaults.isError ? (
            <p className="text-[13px] leading-5 text-warn">
              We could not load the example right now. The section above still works. It reads the
              chain directly once a wallet is connected.
            </p>
          ) : (
            <p className={META}>No vault has been created on devnet yet.</p>
          )}
        </section>
      </div>

      <p className={`${META} leading-5`}>
        Devnet only. Nothing here touches mainnet or real money. For the full explanation, read the{" "}
        <Link href="/walkthrough" className={LINK}>
          Walkthrough
        </Link>
        .
      </p>
    </div>
  );
}
