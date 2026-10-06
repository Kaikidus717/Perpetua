"use client";

import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Stat } from "@/components/Stat";
import { api } from "@/lib/api";
import { compactUsd, explorerUrl, shortAddress, usd } from "@/lib/format";
import { type SecuritizeResult, securitize } from "@/lib/tx";
import { BUTTON, BUTTON_PRIMARY, CARD, CARD_MUTED, INPUT_MONO, LINK, PAGE } from "@/lib/ui";
import { solanaProvider, useSolanaWallet } from "@/lib/wallet";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export default function SecuritizePage() {
  const wallet = useSolanaWallet();
  const demo = useQuery({ queryKey: ["demo"], queryFn: api.demo });
  const [manual, setManual] = useState("");
  const target = wallet.address ?? (manual.trim() || demo.data?.wallet || null);

  const positions = useQuery({
    queryKey: ["positions", target],
    queryFn: () => (target ? api.positionsOnchain(target) : Promise.reject(new Error("no wallet"))),
    enabled: Boolean(target),
  });

  const position = positions.data?.positions[0];
  const valuation = useQuery({
    queryKey: ["valuation", position?.pool],
    queryFn: () =>
      position ? api.valuation(position.pool) : Promise.reject(new Error("no position")),
    enabled: Boolean(position),
  });
  const fairValue = valuation.data?.valuation.fairValuePerShareUsd;
  const ladder = useQuery({
    queryKey: ["ladder", fairValue],
    queryFn: () => (fairValue ? api.ladder(fairValue) : Promise.reject(new Error("no price"))),
    enabled: Boolean(fairValue),
  });

  const check = position?.eligibility ?? null;
  const [busy, setBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [result, setResult] = useState<SecuritizeResult | null>(null);

  async function runSecuritize() {
    const detected = solanaProvider();
    if (!detected || !position) {
      setTxError("Connect a wallet first.");
      return;
    }
    setBusy(true);
    setTxError(null);
    try {
      setResult(
        await securitize(detected, {
          pool: position.pool,
          position: position.address,
          positionNftMint: position.nftMint,
          positionNftAccount: position.nftAccount,
          positionNftProgram: position.positionNftProgram,
          tokenAMint: position.tokenAMint,
          tokenBMint: position.tokenBMint,
          tokenAProgram: position.tokenAProgram,
          tokenBProgram: position.tokenBProgram,
        }),
      );
    } catch (cause) {
      setTxError(cause instanceof Error ? cause.message : "transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={PAGE}>
      <PageHeader
        title="Create shares"
        description="Turn a locked DAMM v2 position into 1,000,000 tradable shares. The position NFT moves into a vault, the share tokens are minted to you, and every fee the position earns then belongs to whoever holds the shares."
      />

      <section className="flex flex-wrap items-center gap-3">
        {wallet.address ? (
          <>
            <span className="font-mono text-sm text-ink">{shortAddress(wallet.address)}</span>
            <button type="button" onClick={() => void wallet.disconnect()} className={BUTTON}>
              Disconnect
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void wallet.connect()} className={BUTTON_PRIMARY}>
            Connect wallet
          </button>
        )}
        <input
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          aria-label="Wallet address to scan for positions"
          placeholder="or paste a wallet address to scan"
          className={`${INPUT_MONO} min-w-[20rem] flex-1`}
        />
      </section>

      {wallet.error ? <p className="text-sm text-warn">{wallet.error}</p> : null}
      {!wallet.available && !manual ? (
        <p className="text-sm text-muted">No wallet detected — scanning the demo wallet.</p>
      ) : null}

      <Section
        title="Positions found"
        description="Only a position that is permanently locked can back shares."
      >
        {positions.isPending && target ? <p className="text-sm text-muted">Scanning…</p> : null}
        {positions.data && positions.data.positions.length === 0 ? (
          <p className="text-sm text-muted">No DAMM v2 positions found for this wallet.</p>
        ) : null}
        {position ? (
          <div className={`${CARD} space-y-4 p-5`}>
            <a
              href={explorerUrl(position.address)}
              target="_blank"
              rel="noreferrer"
              className={`break-all font-mono text-sm ${LINK}`}
            >
              {position.address}
            </a>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted">Unlocked</div>
                <div className="tnum mt-0.5 text-ink">{position.unlockedLiquidity}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Vested</div>
                <div className="tnum mt-0.5 text-ink">{position.vestedLiquidity}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Permanent lock</div>
                <div className="tnum mt-0.5 text-ink">{position.permanentLockedLiquidity}</div>
              </div>
            </div>
            {check?.eligible ? (
              <p className="text-sm text-ink">Eligible for securitization.</p>
            ) : (
              <p className="text-sm text-warn">
                Not eligible: {check?.reasons.join(", ")} — split the locked part first.
              </p>
            )}
          </div>
        ) : null}
      </Section>

      {position ? (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => void runSecuritize()}
            disabled={busy || !check?.eligible}
            className={BUTTON_PRIMARY}
          >
            {busy ? "Waiting for signature…" : "Create shares"}
          </button>
          {txError ? <p className="text-sm text-warn">{txError}</p> : null}
          {result ? (
            <div className={`${CARD_MUTED} space-y-1 p-4 text-sm`}>
              <p className="text-ink">Vault created.</p>
              <p className="font-mono text-xs text-muted">share mint {result.shareMint}</p>
              <a
                href={`https://solscan.io/tx/${result.signature}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className={`font-mono text-xs ${LINK}`}
              >
                {shortAddress(result.signature)} ↗
              </a>
            </div>
          ) : null}
        </section>
      ) : null}

      {valuation.data ? (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Fair value (base)"
              value={compactUsd(valuation.data.valuation.fairValueUsd)}
            />
            <Stat label="Per share" value={usd(valuation.data.valuation.fairValuePerShareUsd, 6)} />
            <Stat
              label="Ask range"
              value={
                ladder.data
                  ? `${usd(ladder.data.plan.rangeLowUsd, 6)} – ${usd(
                      ladder.data.plan.rangeHighUsd,
                      6,
                    )}`
                  : "…"
              }
            />
          </section>

          <Section title="What happens next">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
              <li>
                <code className="font-mono text-xs">create_vault</code> hands the position NFT to
                the vault PDA, mints 1,000,000 share tokens to you, and revokes the mint authority.
              </li>
              <li>
                <code className="font-mono text-xs">DLMM pool + one-sided ask ladder</code> seeds
                the sale around fair value.
              </li>
              <li>
                <code className="font-mono text-xs">stake</code> /{" "}
                <code className="font-mono text-xs">harvest</code> lets holders stake shares and
                pull fees at any time.
              </li>
            </ol>
            <p className="text-xs text-muted">
              Signing runs through{" "}
              <code className="font-mono">packages/sdk/scripts/create-vault.ts</code>, so keys never
              leave the operator machine.
            </p>
          </Section>
        </>
      ) : null}
    </div>
  );
}
